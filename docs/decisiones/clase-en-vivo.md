# La clase en vivo

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: sesion.html: el tablero, la videollamada, el registro de la clase, la ficha presencial y el chat.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

## La clase en vivo: el material del profesor no es el de la clase

En `sesion.html` el profesor tiene delante cosas que la clase NO ve —el PDF que
está leyendo, la lección del curso que está dando— y una sola cosa que la clase
sí recibe: **la posición del tablero**. Esa es la línea, y las dos herramientas
que traen material a la clase la respetan igual.

- **La lección del curso es suya, no de la clase.** "📚 Curso" abre una lección
  de `cursos/protegido/<curso>.html` debajo del tablero **solo en su pantalla**
  (`abrirLeccionLocal`), como el PDF. Antes se sincronizaba por
  `game_state.shown_curso`/`shown_leccion` y la veían todos: el alumno tenía
  delante el temario entero de la lección, **con las respuestas de sus
  ejercicios**, mientras el profesor apenas iba por el primer diagrama. Las dos
  columnas quedaron **sin uso** (no se borraron de la tabla: quitarlas obligaría
  a una migración para nada) y lo único que se sigue haciendo con ellas es
  **dejarlas en null la primera vez** que se abre la clase, para que a nadie con
  la página anterior cargada le quede una lección abierta de antes.
- **Lo que sí viaja es cada posición, una por una.** Cada diagrama de la lección
  —y cada partida y cada ejercicio— trae un botón **"📥 Al tablero de la clase"**
  que transmite **la posición que el profesor está viendo en ese momento**, no
  la inicial del diagrama: `js/finales-100.js` y `js/curso-partidas.js` publican
  en `data-fen-actual` la posición de cada repintado (`publicarFen`), así que
  recorrer la línea y pulsar el botón manda la jugada 12 y no la 0. Mandar
  siempre la inicial no da ningún error — se transmite una posición, solo que la
  que no era.
  - **Los diagramas FIJOS también lo llevan.** Los de «Desequilibrios de
    material» son un dibujo con su pie (`.cp-static`), sin visor que publique
    nada, así que traen la FEN escrita en el HTML en el mismo `data-fen-actual`,
    sacada del archivo de datos del curso y comprobada pieza por pieza contra el
    dibujo. Sin ella eran lo único de la lección sin botón, y eso no daba ningún
    error. El botón va debajo del pie, en su misma columna.
  - El botón se pone con un `MutationObserver`, no recorriendo la lección una
    vez: los visores del curso se construyen **cuando se ven** (los `<details>`
    cerrados esperan a abrirse), así que el que aparezca después se quedaría sin
    él. Mismo patrón que `js/coordenadas-tablero.js`.
  - Hay posiciones de curso que son **ilustraciones y no partidas** (una del
    mapa de los finales tiene un peón y un solo rey, sin rey negro): no se
    pueden poner en un tablero en vivo, y el aviso de por qué va **dentro del
    panel de la lección**, no solo en la franja de estado de arriba — para
    llegar a ese botón hay que tener la lección delante, o sea la franja fuera
    de la pantalla.
- **Las tres puertas que ponen una posición en el tablero escriben por la misma
  función**, `aplicarPosicionEnClase()`: "✅ Aplicar posición" del editor, el
  botón de cada diagrama del curso y el de Táctica. Si cada una armara su propio
  `update`, la que se olvidara de limpiar las variantes o de quitarle el control
  al alumno dejaría la clase con un resto de la posición anterior — y eso no da
  ningún error, el tablero simplemente no se comporta igual según por dónde
  entró la posición. La validación va aparte, en `motivoPosicionInvalida()`: son
  las tres posiciones que chess.js carga sin quejarse y que **rompen a Stockfish
  para el resto de la sesión** (sin rey, con peones en la primera o la última
  fila, con el rey que no le toca mover en jaque).

### La videollamada: el tablero es la pizarra, no la clase

En `sesion.html` se ve la posición, pero la voz va por Meet, Zoom o Teams, y ese
enlace viajaba por WhatsApp antes de cada clase. El panel (`clases.html`) lleva
el botón **al lado de «Sesión en vivo»**, dentro del mismo grupo «Clase en vivo»
y no dentro de la tarjeta: un `<a>` dentro de otro `<a>` no es HTML válido y el
lector de pantalla anunciaría dos destinos donde se ve uno.

- **Se probó guardarlo como una columna de `profiles` y se descartó**, así que
  no se vuelve a intentar: `profiles.enlace_llamada` existió unas horas y se
  quitó (`quitar_profiles_enlace_llamada`). La RLS es por FILA y no por
  columna, y `profiles_select` le deja al alumno ver la fila entera de
  cualquiera de sus profesores — o sea que ahí el enlace le llega SIEMPRE y el
  «solo con la clase abierta» lo dibujaría únicamente la pantalla, que se salta
  desde la consola. En una tabla aparte esa condición ES la política.
- **El enlace es del PROFESOR, no de la clase**, y eso no es comodidad:
  `class_sessions` se crea con un botón o al mandarse una posición, sin pasar
  por ningún formulario, así que un `enlace_video` por clase se quedaría en
  null casi siempre y el botón no se desbloquearía nunca.
  No daría ningún error: un candado para siempre y nadie sabría por qué. Vive en
  `public.profesor_videollamada` (una fila por profesor y grupo) y se pone una vez, en
  **`configuracion.html` → «Videollamada de tus clases»**, que es la única
  pantalla que lo escribe.
- **Una sala POR GRUPO, y una general de respaldo.** Un profesor da clase en
  varias sedes y cada una tiene la suya: con un solo enlace, el de SJ le
  llegaba también a los de CENFO y entraban a la clase que no era. La tabla
  lleva una fila por `(profesor, grupo)` y el grupo vacío es «para todas mis
  clases». El reparto lo hace `mis_clases()`: la sala del grupo del alumno si
  su profesor puso una, y si no la general.
  - **Se reparte por `profiles.grupo` y no por subgrupo**, a propósito: el
    grupo es UNO por alumno, así que no hay dos salas que puedan
    disputárselo. Un subgrupo puede tener al mismo alumno en dos listas y
    habría que inventar un desempate — y el que perdiera mandaría a alguien a
    la llamada de otro grupo sin que nada fallara.
  - **El grupo se ELIGE de una lista, no se escribe**
    (`grupos_de_mis_alumnos()`, que además dice cuántos alumnos suyos hay en
    cada uno): un enlace guardado para «Cenfo» cuando sus alumnos están en
    «CENFO» no le llega a nadie nunca, y el profesor lo ve guardado y cree que
    está.
  - **Al alumno no le llega la lista de salas de su profesor**, solo la suya y
    la general: la política lo filtra por `mi_grupo()`. Con la de otro grupo a
    la vista podría colarse en una clase que no es la suya, y no haría falta
    ni saber SQL.
  - **Quitar una sala filtra por profesor Y grupo.** Con el filtro de menos se
    borrarían las de todas sus sedes de una vez, y la pantalla se vería igual
    de bien — por eso al quitar se vuelve a LEER en vez de tachar la fila en
    pantalla.
  - En el panel, quien da clase ve **una tarjeta por sala** con el grupo
    escrito, no un botón con menú: a las tres de la tarde hay que poder
    apretar «SJ» sin pensarlo. Con más de una, la tarjeta de «Sesión en vivo»
    deja de estirarse (`sm:items-start`), o quedaría media pantalla en blanco.
- **El candado lo hace cumplir la RLS, no la pantalla.** La política de select
  solo le entrega el enlace al alumno **mientras ese profesor tenga una clase
  abierta** (`es_mi_profesor(profesor_id) and clase_abierta_de(profesor_id)`).
  Por eso `mis_clases()` pudo ganar la columna `videollamada` sin repetir la
  condición: es `SECURITY INVOKER`, así que el left join pasa por esa política y
  sin clase la columna llega en null. La regla se escribe UNA vez y no se puede
  saltar desde la consola.
- **El enlace es texto ajeno que se va a ABRIR.** Un `javascript:` en un href se
  ejecuta con la sesión de quien lo toca — la misma regla que el nombre de un
  alumno en Informes. Se comprueba en `js/videollamada.js` con `new URL()` (solo
  `https:`, sin espacios) y otra vez en el CHECK de la tabla: la del navegador
  explica qué está mal, la de la base es la que no se puede saltar. Ese módulo
  está escrito una sola vez porque lo usan las dos pantallas.
- **Los cuatro estados dicen POR QUÉ.** «Se abre cuando tu profe empiece la
  clase» y «Hay clase, pero tu profe todavía no puso el enlace» no son lo mismo:
  el primero se arregla solo y el segundo no, y decir lo mismo dejaría al alumno
  esperando algo que hoy no va a pasar. Bloqueado va sin `href` y con
  `aria-disabled`, como los accesos apagados de la grilla: no promete ningún
  destino, pero se alcanza con Tab (ver «Un acceso apagado no es un enlace
  gris»). Y va con fondo gris y borde en vez de `opacity`, que sobre
  el blanco de la tarjeta de al lado dejaba la nota casi ilegible.
- **De quién es la llamada va escrito** («Con Karina Rojas»): con varios
  profesores el botón puede llevar a la clase de otro, y eso no se adivina.
  `claseConLlamada()` prefiere **la clase que el alumno está mirando** (la del
  selector) aunque no traiga enlace — mandarlo a la llamada de otro profesor
  porque esa sí lo traía es meterlo en la clase que no era, y se ve perfecto.
- **Al profesor no se le bloquea nada**: él entra a la llamada ANTES de que la
  clase exista, así que un candado ahí le cerraría la puerta por la que tiene
  que entrar primero. Sin sala puesta, su botón lleva a Configuración.
- **El botón se desbloquea con la clase de CUALQUIERA de sus profesores**, así
  que hay un canal de Realtime por profesor: el de siempre va filtrado por
  `boardOwnerId` y con dos profesores el candado se quedaría puesto hasta
  recargar, sin que nada fallara.

**Al tocar el botón, `js/videollamada.js` o la tarjeta de Configuración, correr
las dos**: `node herramientas/verificar-panel.js` (el botón, sus cuatro estados
y que un enlace que no se debe abrir no llegue a ningún href) y `node
herramientas/verificar-videollamada.js` (que la tarjeta sea de quien da clase,
que un enlace malo no viaje y que se guarde con el id de quien guarda). Las dos
con el sitio en localhost:8777 y playwright. Está probado que fallan de verdad:
quitando la comprobación del enlace saltan tres comprobaciones en una y ocho en
la otra.

Comprobado impersonando roles en SQL: la profesora guarda su sala y se le
quitan los espacios; su alumno **no ve ninguna fila** sin clase abierta y
`mis_clases()` le da `videollamada` en null; con la clase abierta la ve; su
update sobre la sala ajena cambia **0 filas**; otro profesor que no es su
profesor recibe **0 filas**; y `javascript:`, `http://` y un enlace con espacios
los rechaza el CHECK.

### La pantalla se ordena por QUIÉN VE CADA COSA, no por qué hace cada botón

`sesion.html` es la pantalla más cargada del sitio: catorce controles del
profesor entre la barra de arriba y las pestañas. Estaban puestos sin ningún
criterio —una rejilla de ocho botones idénticos y seis pestañas en el orden en
que se fueron escribiendo—, y eso **no da ningún error**: la pantalla se ve
bien, funciona, y quien la abre por primera vez no sabe por dónde empezar. Para
un entrenador nuevo, con la clase mirando, ese es el momento exacto en que se
pierde.

- **Los ocho botones van en dos grupos, y el rótulo dice QUIÉN LO VE**: «Tu
  material — solo lo ves tú» (Curso, Archivos, PDF, Armar posición) y «El
  tablero — lo ve toda la clase» (Reiniciar, Flechas, Ocultar, Guardar PGN). No
  es una agrupación estética: es **la misma línea que ordena toda la clase en
  vivo** —el material del profesor no es el de la clase— puesta donde de verdad
  hace falta saberla, que es antes de apretar. Sin ese rótulo son ocho botones
  iguales y ninguna pista de cuál se puede tocar con la clase delante.
- **Las pestañas van en el orden de la clase**, que es el orden en que se usan:
  qué voy a dar (Mi plan) → qué le pongo delante (Táctica) → qué le pido
  (Preguntar, Practicar) → a quién se lo estoy dando (Alumnos) → y al final lo
  que no se hace dando clase (Invitar).
- **La que abre sola la primera vez es «Mi plan»**, o sea `TEACHER_TABS[0]`:
  es lo único que contesta «¿qué voy a dar?» y estaba quinta. Abría
  «Controles», cuyo contenido era **un párrafo explicando dónde estaban los
  otros ocho botones** — una pantalla que necesita explicarse es una pantalla
  mal ordenada. Ese párrafo se fue con el rótulo que lo reemplaza, y la pestaña
  quedó en lo único que de verdad hacía: «➕ Invitar».
- «✏️ Editar» pasó a **«✏️ Armar posición»**: lo que hace no es editar nada que
  ya exista, es poner una posición en el tablero a mano.
- Después de la primera vez **se recuerda la última pestaña abierta**, como
  antes: el orden decide dónde se entra, no dónde se vuelve.

**Al tocar la barra de herramientas o las pestañas, correr `node
herramientas/verificar-sesion-orden.js`** (con el sitio en localhost:8777,
playwright y `npm install chess.js@0.10.3`). Reusa el Supabase de mentira de
`verificar-clase-registrada.js` —dos copias del mismo doble se irían separando a
la primera corrección—. Comprueba que los ocho botones estén en sus dos grupos y
**que no quede ninguno fuera** (un botón suelto es el principio de la rejilla sin
criterio de antes), que cada rótulo diga quién lo ve, que el orden de las
pestañas sea el de la clase y que la que abre sola sea «Mi plan», que cada
pestaña apunte a **su** panel (un `aria-controls` al de al lado manda a quien usa
lector de pantalla a un sitio que no era), que abrir una herramienta propia **no
escriba en `game_state`** —que es justo lo que promete el rótulo «solo lo ves
tú»— y que a la alumna no se le pinte nada de esto.

### El modo sencillo de la clase en vivo

Aun ordenada, la pantalla del profesor tiene catorce controles delante, y la
primera clase se da con los alumnos mirando. El modo sencillo deja a la vista lo
que hace falta para darla y guarda el resto a un clic.

- **Qué se ve en modo sencillo**: el grupo «El tablero — lo ve toda la clase»
  (Reiniciar, Flechas, Ocultar, Guardar PGN), el motor de análisis y las
  pestañas «Mi plan», «Alumnos» e «Invitar». **Qué se guarda**: el grupo «Tu
  material» (Curso, Archivos, PDF, Armar posición) y las pestañas Táctica,
  Preguntar y Practicar. Una nota encima lo dice con esas palabras, y el
  botón «🧰 Ver todas las herramientas» las devuelve.
- **Arranca así solo quien lleva menos de tres clases**
  (`CLASES_PARA_TODAS_LAS_HERRAMIENTAS`). A quien ya da clases no se le mueve
  nada de lugar. Son tres y no «ninguna» porque la clase se registra al empezar
  (`abrirClaseSiHaceFalta`): con «ninguna», recargar a mitad de la primera
  clase le cambiaría la pantalla en plena clase. Las clases se cuentan en la
  base con `{ count: "exact", head: true }`. Si no se puede saber, se muestran
  todas las herramientas.
- **Lo que uno elige con el botón manda**: se guarda en el aparato
  (`sesion_modo_sencillo_v1`, como la pestaña abierta) y desde ahí gana a la
  cuenta de clases, en los dos sentidos.
- Si la pestaña abierta se esconde (se vuelve al modo sencillo con Táctica
  delante), se abre «Mi plan», que es la primera. Una pestaña escondida con su
  panel abierto sería un panel al que no se puede volver.
- **El botón va FUERA de la barra de herramientas**, en su propia fila: dentro
  de la barra solo viven sus dos grupos, y `verificar-sesion-orden.js` no deja
  ni un botón suelto. En modo sencillo se quita la línea que separaba los dos
  grupos, porque no separa nada.
- Lo prueba `pruebaModoSencillo` en `verificar-sesion-orden.js`:
  - con una clase arranca sencillo; con tres, completo;
  - lo elegido en el aparato manda;
  - volver al sencillo con Táctica abierta abre «Mi plan»;
  - a la alumna no se le pinta nada.

  El doble compartido (`verificar-clase-registrada.js`) ahora sabe contar, y su
  `abrir()` entra por defecto con todas las herramientas (preferencia `"0"`),
  para que las pruebas de siempre encuentren cada botón.

### La sesión en vivo se abre cuando el profesor la abre

El alumno entraba al tablero a cualquier hora. Veía la posición que hubiera
quedado de la clase anterior y **no tenía forma de saber si había clase o no**:
el tablero se ve exactamente igual un martes a las tres que un domingo. Y como
la clase se abría SOLA al conectarse él, asomarse un domingo le dejaba al
profesor una clase abierta en el registro —con su fecha y su hora— que además
crecía sola hasta que alguien la cerrara.

Ahora la clase existe porque el profesor la abrió, y hasta entonces la sesión
en vivo está cerrada para el alumno. Con eso «hay clase» pasa a significar algo.

- **El candado lo hace cumplir la base, no la pantalla.** `game_state_select` y
  `variant_nodes_select` le entregan la fila al alumno solo con
  `es_mi_profesor(owner_id) and clase_abierta_de(owner_id)` — la misma función
  que ya acotaba el enlace de la videollamada, aplicada a lo que de verdad ES
  la clase. Sin eso, bloquear la pantalla sería dibujar un candado que se salta
  desde la consola. Comprobado impersonando roles en SQL, cinco casos: sin
  clase el alumno recibe **0 filas** de las dos tablas, con clase abierta las
  recibe, la profesora ve SU tablero siempre —entra antes de abrir la clase, y
  un candado ahí le cerraría la puerta por la que tiene que entrar primero— y
  otro profesor sigue sin verlo.
- **La presencia dejó de abrir clases, y con ella se fue `alumnosAlCerrar`.**
  Era el primer disparador —«hay alguien del otro lado»— y ya no puede
  dispararse: sin clase abierta el alumno no llega a conectarse. Lo único que
  seguía alcanzándolo era el rastro de la clase recién cerrada, que es
  justamente lo que aquella variable existía para atajar. Quedan las **dos
  puertas deliberadas del profesor**: mandar una posición
  (`aplicarPosicionEnClase()`) y el botón «Abrir la clase».
  - Eso **no deja clases sin registrar, al revés**: antes el registro dependía
    de que entrara alguien; ahora sin abrirla no hay clase que dar, así que
    queda garantizado por construcción.
  - La comprobación de «después de cerrar, ningún aviso de presencia la vuelve
    a abrir» **se queda** aunque hoy no haya con qué: el día que alguien vuelva
    a enganchar un disparador ahí, salta en la prueba y no al día siguiente con
    la clase de hoy sin registrar.
- **La franja del profesor dice la CONSECUENCIA, no el mecanismo**: «⚪ La clase
  todavía no está abierta: tus alumnos no pueden entrar y no se está
  registrando nada». Un «todavía no hay clase abierta» a secas no le dice a un
  entrenador nuevo que la clase que está por dar no la va a ver nadie.
- **Al alumno se le dice quién tiene que abrirla, y la página se abre sola.**
  `#sin-clase` reemplaza a `#app` con el nombre de su profe («Karina Rojas
  todavía no ha abierto la clase»), el selector de clase y la vuelta al panel.
  Un canal de Realtime **por profesor** —no solo por el que está mirando, que
  es el error fácil: la clase la puede abrir cualquiera de ellos— recarga en
  cuanto la suya abre, y si abre la de OTRO se lo dice en vez de dejarlo
  esperando a quien hoy no va a abrir.
  - **Recargar y no montar a mano** es la misma decisión que cambiar de clase:
    todo cuelga de `boardOwnerId` y montarlo en caliente dejaría la mitad de
    las suscripciones sin hacer.
- **En el panel, la tarjeta «Sesión en vivo» lleva el mismo candado que el
  botón de la videollamada que va a su lado**, y por la misma razón: sin clase
  abierta entrar solo le pintaría una pantalla vacía. Va bloqueada con la pinta
  de `VLL_APAGADO` —fondo gris y borde, no `opacity`, que sobre el blanco de la
  tarjeta deja la nota ilegible— y **sin `href`**: no promete ningún destino,
  pero se alcanza con Tab. Se destapa sola con el aviso de Realtime, sin
  recargar, **y lo dice en voz alta**: la región viva `#aviso-clase` anuncia
  «Karina Rojas abrió la clase: ya puedes entrar a la sesión en vivo» (y «La
  clase en vivo terminó» al cerrarse). Quien ve la pantalla nota el cambio;
  quien usa lector de pantalla no se enteraba hasta volver a pasar por ahí. Se
  anuncia solo el CAMBIO, nunca al cargar: ahí la tarjeta ya lo dice.
  - Se abre si **cualquiera** de sus profesores tiene clase, igual que el botón
    de la videollamada. Si el que entra no es el que está mirando,
    `sesion.html` se lo dice y le ofrece el selector: es un camino coherente,
    no una promesa rota.
  - La tarjeta vive dentro de un envoltorio `#sesion-wrap` con **`contents`**,
    para poder repintarla sola sin cerrar nada de lo que haya abierto debajo.
    `contents` la deja siendo la celda del grid: sin eso, el envoltorio se
    comería el `sm:items-start` y la tarjeta dejaría de estirarse.

**Al tocar esto, correr las dos**: `node herramientas/verificar-clase-registrada.js`
y `node herramientas/verificar-panel.js`. La primera comprueba que conectarse un
alumno **no abre ninguna clase** (ni uno ni dos), que el botón sí, y que la
alumna sin clase abierta **no monta la sesión**, ve el aviso de verdad (con
`checkVisibility()`, no la clase) con el nombre de quien tiene que abrirla, y no
le pide el tablero a la base. La segunda, que la tarjeta esté bloqueada sin
enlace, que **no quede ningún `a[href=sesion.html]` en la grilla** —un enlace
invisible pero presente sigue siendo una parada de tabulador— y que **se destape
sola** al abrirse la clase. Está probado que fallan de verdad: dejando entrar al
alumno saltan 3 comprobaciones en una, volviendo a poner el disparador de
presencia otras 3, y quitando el candado de la tarjeta 3 en la otra.

- **Los dobles tuvieron que aprender dos cosas, y las dos daban verde sobre una
  página rota.** `mis_clases()` devuelve la columna `profesor`, no
  `profesor_nombre` —con el nombre equivocado la pantalla de espera dice «Tu
  profe» y la prueba lo da por bueno— y `clase_abierta` sale de las MISMAS filas
  de `class_sessions` que sirve el doble, como la calcula la base: dejarla fija
  en `false` le cierra al alumno una clase que sí está abierta, y en `true` da
  por buena una página sin candado. Y `verificar-sesion-curso.js` necesitó
  `upsert()`: desde que hay clase abierta la alumna marca su asistencia sola, y
  sin ese método la página muere con un TypeError que la prueba cuenta como
  fallo suyo — era el doble el que estaba incompleto.

### La clase en vivo, vista por quien supervisa

Quien supervisa puede **mirar la clase de uno de sus profesores mientras la da**:
`sesion.html?observar=<id>`. Se llega desde «🔴 En clase ahora · Mirar la
clase» en `supervision.html` (sale solo junto a quien tiene la clase abierta) y
desde el panel «Ver como» de ese profesor. Quien administra también puede.

- **Lo que puede leer lo decide la RLS**: `game_state_select_supervisor`,
  `variant_nodes_select_supervisor` y `profesor_videollamada_select_supervisor`
  dejan leer el tablero, las variantes y el enlace de la videollamada del
  profesor **solo mientras tiene la clase abierta** y solo si lo supervisa (en
  su academia activa, si tiene varias). El conjunto se arma una vez,
  `interno.clases_que_superviso()`. Cerrada la clase, 0 filas. **Ninguna
  política de escritura cambió.**
- **Solo mira.** No mueve el tablero (no es interactivo), no marca asistencia
  ni tiempo en clase, no abre ni cierra la clase, no contesta preguntas, no
  entra a la práctica ni al chat (esos son entre el profesor y cada alumno).
  Una supervisora anotada como alumna ensuciaría justo los registros que
  después revisa.
- **Entra a la presencia como `supervision`, no como alumna**: no aparece en la
  lista de alumnos del profesor ni en su chat. Ve quién está conectado.
- **El profesor ve que lo están mirando**: «👁 Marta Solano (supervisión) está
  mirando la clase.», arriba de la franja de la clase. Mirar sin que el otro lo
  sepa no es supervisar.
- La videollamada sale como enlace solo si es `https`.
- Sin clase abierta, lo dice en palabras («Karina Rojas no tiene la clase
  abierta ahora») y lleva de vuelta a Supervisión; al cerrarse la clase,
  vuelve sola a Supervisión.
- Un alumno con `?observar=` en la dirección sigue siendo alumno: el modo solo
  se enciende con `es_supervisor` o `is_admin`, y la RLS decide igual.
- Comprobado impersonando roles en SQL (revertido): con la clase abierta la
  supervisora ve el tablero de su profesor (1 fila) y no el de un profesor de
  otra academia (0); cerrada la clase, 0; otro profesor y una llamada sin
  usuario, 0.

**Al tocarlo, correr `node herramientas/verificar-todo.js clase-supervisor
clase-registrada informe-mensual ver-como`.** `verificar-clase-supervisor.js`
comprueba todo lo de arriba desde el navegador; está probado que falla de
verdad: dejando que marque asistencia o que entre como alumna, saltan.

### La clase se registra sola, porque el botón vivía en la página que no era

Todo lo que el sitio sabe de una clase —la asistencia, los minutos en clase, el
«asistió a 4 de 5» del informe a la casa, el reporte de actividades y el «clases
este mes» del panel del profesor— cuelga de que exista una fila **abierta** en
`class_sessions`. Y esa fila la abría un botón que vive en **`clases.html`**,
mientras que la clase se da en **`sesion.html`**.

Al tablero se entra **directo desde el grid del panel**, sin pasar por esa
franja — que además solo aparece cuando tiene algo que decir. O sea: un
entrenador nuevo da su clase entera, con la pizarra, las preguntas y los
alumnos conectados, y **no queda registrada ninguna**. No da ningún error: esa
clase simplemente no existió, y eso no se puede reconstruir después.

- **La clase se abre con un acto deliberado del profesor, no al entrar**: el
  botón «Abrir la clase» o **transmitir una posición**
  (`aplicarPosicionEnClase()`, por donde pasan las tres puertas). Abrirla con
  solo entrar llenaría el registro de clases de dos minutos que nadie dio cada
  vez que se asoma a preparar algo, y los informes contarían de más. Hubo un
  tercer disparador —que se conectara un alumno— y se fue: ver «La sesión en
  vivo se abre cuando el profesor la abre».
- **Se engancha DESPUÉS de que la posición se haya transmitido**, no antes:
  abrir la clase por un intento que falló —una posición que la validación
  rechaza— dejaría registrada una clase que no se dio.
- **Que no se abran dos lo impide un índice único parcial**, no la bandera del
  navegador: `class_sessions_una_abierta_por_profesor` sobre `(created_by) where
  ended_at is null`. Los dos disparadores pueden caer juntos, y dos pestañas del
  mismo profesor, peor. Con dos filas abiertas la asistencia se reparte entre
  las dos y **cada informe cuenta la mitad**, sin que nada falle. Es el mismo
  patrón que el UNIQUE de `examen_respuestas` y el de `avisos_cobro`: lo que no
  puede pasar dos veces lo garantiza un índice, no un `if` que dos pestañas se
  saltan. El insert atiende el `23505` y se queda con la que ya hay, porque eso
  no es un fallo — es el índice haciendo su trabajo.
- **La franja de `sesion.html` dice con todas las letras si se está registrando
  o no**, no con un color: «🔴 Clase en curso: se está registrando la asistencia
  y el tiempo de tus alumnos» o «⚪ La clase todavía no está abierta: tus
  alumnos no pueden entrar y no se está registrando nada». Un punto gris no le
  dice a un entrenador nuevo que la asistencia se está perdiendo.
- **Cerrar pide el nombre y la nota ahí mismo**, en dos toques: el primero
  destapa los campos, el segundo cierra. Así no se cierra de un clic accidental
  en medio de la clase, y se recoge lo único que hace falta para que el registro
  sirva después — mandarlo al panel a escribirlo es mandarlo a otra página justo
  cuando terminó y se va.
- **El botón del panel se queda**, como atajo para abrirla ANTES de entrar, pero
  ahora dice que no hace falta apretarlo. Dos botones que parecen obligatorios
  confunden más que uno que se explica.
- `markAttendance()` y `startPresenceLog()` se disparan con el INSERT que llega
  por Realtime, así que **la clase se puede abrir en cualquier momento** — pero
  hoy el alumno solo entra con la clase ya abierta, así que ese camino es el de
  quien está dentro cuando el profesor la cierra y la vuelve a abrir.

#### Cerrar la clase tiene que SIGNIFICAR cerrarla

El disparador de "hay alguien del otro lado" se vuelve a evaluar en **cada** aviso
de presencia, y los alumnos no cierran su pestaña en el mismo segundo en que el
profesor confirma el cierre. Así que el aviso siguiente encontraba alumnos
conectados y abría una clase NUEVA, uno o dos minutos después de la que se
acababa de cerrar. La franja volvía sola a verde, y el profesor —que ya terminó y
se va— dejaba esa fila abierta para siempre.

**Lo caro viene al día siguiente, y es lo que se ve como "la clase no queda
registrada":** el índice `class_sessions_una_abierta_por_profesor` impide una
segunda fila abierta, así que la clase de mañana no abre ninguna — se cuelga de la
fantasma que quedó, con su fecha y su hora de hace un día. En el registro no
aparece ninguna clase nueva y la duración de la vieja crece sola. Ningún error en
ninguna parte.

- **Se arregló primero guardando quiénes estaban conectados al cerrar**
  (`alumnosAlCerrar`), para que el aviso siguiente no contara el rastro de la
  clase recién cerrada. Esa variable **ya no existe**: al quitar el disparador
  de presencia (ver «La sesión en vivo se abre cuando el profesor la abre») no
  quedó nada que pudiera reabrirla sin querer, y las dos puertas que quedan
  —mandar una posición, el botón «Abrir la clase»— son actos suyos.
- Vale igual **si la cerró desde el panel o desde otra pestaña**: lo que llega por
  Realtime es un cierre igual de deliberado, y la franja de acá tiene que decir
  la verdad igual.
- **El cierre se pide de vuelta con `.select()`**, y se mira si volvió alguna fila.
  Sin eso, un update que no toca ninguna fila —el id quedó viejo porque la cerraron
  desde otro lado— devuelve `error: null` y la pantalla decía "cerrada" con el
  título y la nota tirados a la basura: justo lo que el registro necesita para
  servir después. Ahora se dice y se manda a escribirlos al registro del panel.
- Y cuando sí se cerró, **se dice con todas las letras y con su nombre** («✅ Clase
  cerrada y guardada en el registro como "Finales de rey y peón"»). Cerrar es el
  momento en que uno quiere saber que quedó guardado.

**Al tocar esto, correr `node herramientas/verificar-clase-registrada.js`** (con
el sitio en localhost:8777, playwright y `npm install chess.js@0.10.3`).
Comprueba que entrar solo **no invente ninguna clase**, que conectarse un
alumno tampoco y que el botón sí la abra y a nombre de quien la da, que mandar
una posición también la abra y que una **rechazada** no, que un segundo aviso
de presencia no abra otra, que
cerrar mande el título, la nota y la hora **sobre la clase que estaba abierta**,
que después de cerrar **ningún aviso de presencia la vuelva a abrir** —ni el del
mismo alumno que ya estaba ni uno que entra después—, y que a la alumna no se le
pinte la franja pero su asistencia sí se marque sola. Está probado que falla de
verdad: con el disparador de presencia de antes saltan tres comprobaciones.
Su Supabase de mentira **apunta el filtro al RESOLVER y no en el `update()`**:
`.update(x).eq("id", y)` encadena, así que uno que lo capturara antes daría por
bueno un cierre sobre la clase que no era. Su `delete()` hace lo mismo y además
**borra de verdad de la tabla**, para que una consulta posterior no encuentre lo
que ya no existe. Lo reusan `verificar-sesion-orden.js` y
`verificar-chat-clase.js`, y acepta **filas de arranque** para sembrar una tabla
(los mensajes de una conversación, por ejemplo).

### La clase presencial también se registra, y es una `class_sessions` MÁS

La clase del aula no existía para el sitio. El profesor daba su clase
presencial, y esa clase no salía en Informes, no contaba para el «asistió a 4 de
5» que llega a la casa, no entraba al reporte de actividades y no sumaba al
«clases este mes» de su panel. No daba ningún error: simplemente, para la
plataforma, el alumno que solo va presencial no entrenaba nunca.

`asistencia.html` (tarjeta **«✅ Asistencia presencial»** en Herramientas, al
lado de Planes de clase) es donde se pasa lista: el día, la hora, cuánto duró,
qué se trabajó y quiénes llegaron.

**Lo que se guarda es una `class_sessions` normal con `modalidad =
'presencial'`, no una tabla nueva.** Esa es la decisión de fondo: todo lo que el
sitio sabe de una clase cuelga de `class_sessions` + `class_attendance`, así que
con una tabla aparte habría que tocar las cuatro funciones que las leen
—`informes_resumen_alumnos()`, `informe_de_alumno()`, `reporte_actividades()` y
`panel_profesor()`— y las cuatro se irían separando a la primera corrección.
Siendo la misma fila, la ficha **entra sola**: no hay ni una línea que «lleve»
la asistencia presencial a los informes.

- **La ficha nace CERRADA** (`ended_at` puesto), y eso hace dos cosas de una: no
  choca con el índice `class_sessions_una_abierta_por_profesor` —o sea que
  llenar la ficha del martes no le impide abrir la clase en vivo de hoy— y no es
  una clase «abierta» para ningún alumno.
- **El aviso push tuvo que aprender a callarse.** `class_sessions_avisa_push`
  era un `AFTER INSERT` a secas, así que guardar la ficha de ayer le habría
  mandado a todos sus alumnos «Empezó la clase · Entra cuando puedas» con enlace
  a `/sesion.html`, a un tablero cerrado y por una clase que ya terminó. Lleva
  ahora su `WHEN (new.modalidad = 'en_linea' and new.ended_at is null)` — la
  misma lección que dejó `avisar_examen_reabierto`.
- **Pasar lista es del profesor, y eso hacía falta abrirlo.**
  `class_attendance_insert_own` exige `auth.uid() = student_id`: la asistencia
  en vivo la marca el alumno al conectarse. Las políticas nuevas
  (`class_attendance_insert/update/delete_profesor`) van **acotadas a
  `modalidad = 'presencial'`** a propósito: en una clase en vivo la asistencia la
  registra el sistema, y dejar escribirla a mano ahí sería poder inventar que
  alguien entró a un tablero al que nunca entró. Lo que se abre es la ficha, no
  la asistencia entera. Y el **delete** hace falta tanto como el insert: marcar
  a quien no fue y no poder desmarcarlo le deja una asistencia de más en el
  informe que llega a su casa.
- **Los minutos entran por `class_presence_log`**, un tramo por asistente, como
  cualquier latido de la clase en vivo. Así las tres funciones que cuentan
  minutos los suman **sin tocarlas**, y `minutos_por_tramos()` los une con los
  demás, de modo que una presencial que se solape con una en línea no se cuenta
  dos veces. Sin ese tramo, un alumno que solo va presencial saldría con «5
  clases, 0 minutos» y eso no da ningún error.
  - Eso obligó a la única excepción de `proteger_tiempos_de_presencia()`, que
    existe para que un alumno no se infle los minutos desde la consola: en la
    ficha el tramo **no lo mide un latido, lo DECLARA el profesor**, así que las
    horas tienen que pasar. **La excepción se lee de la FILA** —ser el creador
    de esa clase presencial— y no de una marca local como
    `ajedrez.contando_invitaciones`: una marca hay que acordarse de ponerla y el
    alumno podría poner la suya, mientras que «ser el creador» no se puede
    falsificar. Para el alumno el trigger sigue exactamente igual de cerrado.
- **Guardar es UNA llamada**, `guardar_clase_presencial()`, `SECURITY INVOKER`
  como `crear_tarea()`: partido en dos —la clase y después la lista— si la
  segunda mitad falla queda una clase con cero asistentes, que en el reporte se
  lee como una clase a la que no fue nadie. Deja la lista **exactamente como se
  mandó** (la regla de `set_teachers` y `equipo_set_alumnos`): pasar lista se
  corrige, y una lista que solo suma no se puede corregir.
  - Su `update` filtra por `modalidad = 'presencial'`: sin eso, esta pantalla
    editaría también una clase EN VIVO —moviéndole las horas y borrándole el
    título— desde un formulario que no sabe nada de ella.
  - Rechaza una clase **del futuro** (una ficha se llena después de darla; el
    día de margen es para el huso, no para agendar) y una duración fuera de 5 a
    600 minutos, que no es una regla de negocio sino un error de dedo: 6000
    minutos le meterían cuatro días de «tiempo en clase» a cada asistente, y eso
    se ve perfecto en el informe que llega a su casa.

Comprobado impersonando roles en SQL, 12 casos: la ficha guarda sus dos
asistentes con su tramo de 60 minutos de verdad, desmarcar a uno lo quita de la
asistencia **y de los minutos**, la clase futura y la de 6000 minutos se
rechazan, la ficha queda presencial y cerrada, otro profesor no la edita, el
alumno que intenta insertarse un tramo de veinte años se queda con **0 minutos**
—el trigger le sigue poniendo `now()`— y no puede crear ninguna clase.

#### Llegar tarde no es faltar, y tampoco es llegar

La ficha solo sabía decir «vino» o «no vino», así que a quien entró media hora
después se le marcaba presente y quedaba con la clase entera de «tiempo en
clase». Eso no da ningún error: el informe que llega a su casa dice 60 minutos
donde hubo 30, y la tardanza —que es justo lo que una familia pregunta— no
quedaba registrada en ninguna parte.

Cada alumno marcado tiene ahora, a su derecha, un recuadro donde se escriben
los **minutos** que llegó tarde. En blanco es a tiempo, que es el caso de casi
todos.

- **Se guarda en MINUTOS y no como una marca de «llegó tarde»**, por dos
  razones que son la misma: los minutos dicen si fueron cinco o cuarenta, y son
  lo único con lo que se puede corregir el tiempo. Una marca sola dejaría el
  tramo mintiendo igual.
- **`class_attendance.joined_at` ya significaba «cuándo se unió»**, así que la
  tardanza no estrena una segunda columna de hora: es la misma desplazada, y el
  tramo de `class_presence_log` arranca ahí. Con eso los minutos salen bien en
  Informes, en el informe a la casa y en el reporte **sin tocar ninguna de las
  tres funciones que los cuentan**. `minutos_tarde` se guarda aparte para poder
  contar las veces sin restar horas.
- **Solo lo escribe `guardar_clase_presencial()`**: en una clase en vivo la
  asistencia la marca el alumno al conectarse y su `joined_at` ya es la hora
  real, así que ahí la columna no significa nada y se queda en 0.
- **Una tardanza que no cuadra se RECHAZA, no se ignora.** Llegan de la
  pantalla, así que una de alguien que no está marcado —o más larga que la
  clase— es un error de programación: descartarla en silencio lo dejaría
  escondido hasta que alguien mirara el informe. Se valida **antes de escribir
  nada**, para que un guardado no quede a medias.
- **La pantalla valida lo mismo, pero CON EL NOMBRE.** La base es la que manda;
  un «no se pudo guardar» sobre veinte casillas deja a quien pasó lista sin
  saber cuál arreglar, así que acá se dice «a Bruno Mena le pusiste 90 minutos
  tarde en una clase de 60: eso no es llegar tarde, es no llegar».
- **Desmarcar a alguien le borra la tardanza**, y las tres puertas que
  desmarcan tienen que hacerlo: la casilla, «Ninguno» y el selector de
  subgrupos —que desmarca a quien no es del subgrupo y no sabe que el recuadro
  existe—. Una tardanza colgada hace que la base rechace el guardado entero por
  algo que en pantalla ya se corrigió.
- **El recuadro solo se ve sobre quien está marcado**: preguntar a qué hora
  llegó quien no vino no significa nada.
- **La fila es un `<div>` con el `<label>` dentro**, envolviendo solo la casilla
  y el nombre. Con el recuadro dentro del label, tocarlo para escribir habría
  **desmarcado al alumno** — el clic en cualquier hijo de un label activa su
  control.
- **El formulario va con `novalidate`**, y eso lo destapó este cambio: con
  `min`, `max` y `step` puestos, un número que no cumpla —una duración de 3
  minutos, unos 7 minutos tarde contra un `step` de 5— lo corta el navegador con
  SU globo, en el idioma del navegador, y el `submit` no llega a dispararse: los
  avisos en español de la página no salen nunca y nadie entiende por qué no
  guarda. Los atributos se quedan puestos, que es lo que anuncia el lector de
  pantalla al entrar al campo. Misma decisión que `bienvenida.html`.
- En el reporte, las tardías van en el resumen, en una columna **«Tarde»** por
  clase y en una **«Llegó tarde»** por alumno con las veces Y los minutos: tres
  tardías de cinco minutos y tres de media hora son cosas distintas. Las tres
  solo aparecen si hubo alguna, como la columna de presenciales. Y la nota al
  pie dice que esos minutos **ya están descontados**, o parecería que se cuentan
  dos veces.

Comprobado impersonando roles en SQL, 14 casos: quien llega 20 minutos tarde a
una clase de 60 queda con 40 minutos de clase y su `joined_at` 20 minutos
después del inicio; el que llegó a tiempo con los 60; corregir la ficha
quitándole la tardanza le devuelve sus 60; una tardanza de alguien no marcado y
otra más larga que la clase se rechazan; el reporte las cuenta en los tres
niveles; y **queda UNA sola versión de la función** —la firma vieja se borró, o
PostgREST resolvería una u otra según qué parámetros lleguen y la que quedara
sin tardanzas las borraría al volver a guardar.

#### Qué se hizo en la clase, y cómo lo dice el informe

El campo «Qué se hizo en esta clase» es `class_sessions.notes`, el mismo que ya
pinta el reporte de actividades dentro de «Lo que se trabajó». Es opcional, y la
pantalla dice con todas las letras dónde sale y quién lo lee: nadie más que quien
prepara el informe — ni el alumno ni su casa.

**El reporte dice CUÁLES clases fueron presenciales**, y eso no es cosmético: sin
la modalidad, las del aula entran contadas dentro de «N clases en vivo», que es
falso, y quien lee el informe no tiene forma de separarlas. Lo dice en tres
lugares —el párrafo del resumen, la columna **«Dónde»** de la tabla de clases y
una columna por alumno—, siempre **escrito** y nunca con un color o un icono:
este informe se imprime y lo lee alguien que no sabe nada de la plataforma.

- El reparto solo se dice **cuando hay de las dos**: «y ninguna presencial» es
  ruido en todas las visitas menos una. Con un solo tipo dice «todas
  presenciales» o «todas en la plataforma».
- La columna «De ellas presenciales» **no se pinta si no hay ninguna**: una
  columna entera de ceros ocupa ancho y no dice nada.
- Y si los totales llegaran **sin partir** (una versión vieja de
  `reporte_actividades()`), se cuentan todas como de la plataforma, que es lo que
  eran antes de existir la ficha, en vez de decir «0 y 0».
- La nota al pie de la tabla de tiempos dice de dónde salen los minutos
  presenciales: la duración que anotó quien dio la clase, no una medición de la
  plataforma. Prometer que se midieron sería prometer algo que no pasó.

- **Solo se le pasa lista a un alumno PROPIO.** Las políticas de profesor de
  `class_attendance` y `class_presence_log` exigían ser el creador de la clase
  presencial y nada más: con eso se le podía inventar asistencia y minutos a un
  alumno de OTRA profesora, y le llegaba a su informe y al correo de su casa.
  Ahora exigen además `soy_profesor_de(student_id)` o administrar
  (migración `ficha_presencial_solo_alumnos_propios`, comprobada impersonando:
  el propio entra, el ajeno no).

**Al tocar `asistencia.html`, `js/reporte-armar.js` o la tabla
`class_sessions`, correr `node herramientas/verificar-asistencia.js`** (con el
sitio en localhost:8777 y playwright). Todo lo que se rompe acá se rompe
callado, así que se mira desde afuera: que **la hora local viaje como el instante
que fue** —el verificador fija la zona en `America/Costa_Rica` y comprueba que
las 15:00 salgan como las 21:00 UTC; mandar los dos campos como si fueran UTC
deja la clase fechada el día siguiente sin dar ningún error—, que el buscador
**esconda las casillas en vez de sacarlas del DOM** (con media lista fuera, el
selector de subgrupos dejaría marcada a gente que no fue), que «los del martes»
marque a los suyos y desmarque al resto, que guardar sin nadie marcado pida un
segundo toque, que **corregir mande la lista completa y el id de ESA ficha**, que
los recuadros de minutos tarde **nazcan escondidos** —medido al abrir la página y
no más adelante, porque para entonces el selector de subgrupos y los propios
`change` ya los habrán recalculado y daría verde aunque nacieran todos a la
vista—, que la tardanza viaje con sus minutos, que **desmarcar y volver a marcar
deje el recuadro Y el contador de acuerdo** —se comprueba ANTES de guardar,
porque guardar bien llama a `limpiar()`, que vacía el mapa entero y taparía el
fallo—, que una tardanza más larga que la clase no se mande y se diga de quién
es, que **una duración imposible la rechace la página en español** y no el globo
del navegador, que
la clase EN VIVO del mismo profesor no se ofrezca acá, que borrar filtre por su
id, que a la alumna no se le pinte nada y que la página **se vea** (sin CSS
impreso como texto y en oscuro cuando el tema está en oscuro). Está probado que
falla de verdad: mandando la fecha como UTC salta 1, sacando las casillas del DOM
saltan 2 y quitando la columna «Dónde» saltan 2.

- **Su doble de Supabase apunta los filtros en el RESOLVER**, no dentro del
  `delete()`: `.delete().eq("id", x)` encadena, así que uno que los capturara
  antes daría por bueno un borrado sobre la ficha que no era — la misma trampa
  que ya documentó `verificar-clase-registrada.js`.
- Y sus filas llevan `modalidad` y `created_by`, que es por donde la página las
  pide: un doble sin esas columnas daría verde sobre una página que se baja las
  clases de todo el mundo.
- **`js/subgrupos-marcar.js` va SIN `defer`**, como en Tareas y Exámenes: con él
  corre después de parsear el HTML, o sea después del script del cuerpo que lo
  llama, y el selector no se monta — sin dar ningún error. Es la misma carrera
  que ya documentaron `js/notificaciones.js` y `js/adaptive-mode.js`.
- Ese módulo **marca y desmarca las casillas**, y quien lleva la cuenta en esta
  pantalla es un `Set`: hay que volver a leerlas escuchando su selector y no su
  `alMarcar`, porque ese solo avisa al elegir un subgrupo — al volver a «— un
  subgrupo —» desmarca todo y no avisa, y el `Set` se quedaría lleno de gente
  que ya no está marcada.

#### El horario: la ficha se llena sola, y la que falta se pide

La ficha presencial se llenaba desde cero cada vez —el día, la hora, cuánto
duró y veinte casillas— y la que no se llenaba no existía: la clase no salía en
ningún informe y nadie se enteraba. Cada profesor tiene ahora **«🗓️ Tu
horario»** arriba de la ficha, en `asistencia.html`: «martes 15:00, 90 min,
grupo 7B, en el aula».

- **`public.horario_clases`**: día de la semana, hora (de Costa Rica),
  duración, `grupo` **o** `subgrupo_id`, título, modalidad y `desde`/`hasta`.
  Cada quien escribe lo suyo (la RLS exige `profesor_id = auth.uid()` y un
  subgrupo propio); lo leen también su supervisión y quien administra.
- **Quitar una clase NO la borra, la cierra**: se le pone `hasta` en ayer.
  Borrarla le quitaría al informe de los meses pasados las clases que sí
  estaban programadas —el «7 de 8» de agosto pasaría a «7 de 0» sin que nadie
  lo tocara—. Solo se borra de verdad la agregada hoy mismo, que no tiene
  historia.
- **«Pasar lista» llena la ficha con la última vez que tocaba esa clase** y
  marca a los del grupo o del subgrupo. **Nacen marcados a propósito**: pasar
  lista de doce es desmarcar a los dos que faltaron. Lo peligroso es guardar
  sin mirar, y por eso el aviso no dice «listo», dice cuántos quedaron marcados
  y «desmarca a quien no llegó».
- **Las fechas son de Costa Rica en los dos lados** (`hoyCR()` en la página,
  `at time zone 'America/Costa_Rica'` en la base): el aviso y el informe
  comparan por día, y una ficha fechada con otro huso no le taparía el aviso a
  nadie.

**Cuándo tocaba clase lo cuenta UNA función, `ocurrencias_horario()`** (sin
`execute` para nadie con sesión), y la usan las dos cosas que salen del horario:

- **El aviso de la ficha que falta** (`avisar_fichas_faltantes()`, `pg_cron` a
  los 10 de cada hora): una clase **del aula** de hoy o de ayer que terminó hace
  más de una hora, sin **ninguna** clase de ese profesor ese día. Lleva a
  `asistencia.html?horario=<id>&fecha=<día>`, que abre la ficha ya llena. Sale
  una sola vez por clase y día (`avisos_ficha_faltante`, la llave primaria). Las
  de la plataforma no avisan: se registran solas al abrir la clase en vivo, y si
  no se abrió no hubo clase que registrar.
- **«Clases de su horario dadas: 7 de 8»** en el informe mensual y en
  supervisión. Son dos columnas nuevas **al final** de `actividad_profesor()`
  (`clases_programadas`, `clases_programadas_dadas`), así entran solas en la
  foto que viaja con el informe y en `resumen_profesores_supervisados()`. Hubo
  que borrarla y volverla a crear —cambia lo que devuelve— y devolverle el
  `execute` a `authenticated`.
  - **Solo cuentan las que ya terminaron**: la de esta tarde todavía no se debe.
  - **Se compara por día**: un día con dos clases programadas y una dada cuenta
    una, no dos.
  - Sin horario dice **«Sin horario»** y no «0 de 0», que se lee como un mes
    sin trabajo; una foto enviada antes de esto dice «—».

Comprobado en SQL (revertido): con una clase diaria desde el 1.° el profesor
tiene 23 programadas y 2 dadas, el aviso sale una vez y la segunda corrida no
manda nada; otra profesora no ve el horario ajeno (0 filas), no puede crear uno
a nombre de otra, y un alumno no puede crear ninguno. `verificar-asistencia.js`
comprueba que la dirección del aviso deje la ficha en ESE día con los del grupo
marcados, que agregar mande el subgrupo a nombre de quien da clase, que quitar
cierre con `hasta` en ayer la que tiene historia y borre la de hoy, y que una
fecha del futuro caiga en la última que ya pasó. Está probado que falla de
verdad: haciendo que quitar borre siempre, salta.

### Vaciar el chat: la base siempre lo permitió, lo que fallaba era la pantalla

«Vaciar esta conversación» parecía no funcionar: el profesor apretaba, confirmaba,
y los mensajes seguían ahí. La RLS no tenía nada que ver —`class_chat_messages_delete`
deja borrar el hilo entero del alumno a quien es su profesor, y el borrado SÍ
ocurría—. Lo que no ocurría era el repintado.

- **El DELETE llegaba sin `student_id`.** Con la replica identity por omisión, el
  payload de un borrado solo trae la clave primaria, y `subscribeChat()` decide a
  qué conversación pertenece cada cambio justamente por esa columna. El evento no
  coincidía con ningún hilo, no se recargaba nada, y la lectura natural de eso es
  "no me deja vaciarlos". Al alumno, peor: le quedaban a la vista mensajes que ya
  no existían hasta que recargara. Se arregló con `replica identity full` sobre
  `class_chat_messages` —9 filas de 500 caracteres: replicar la fila entera acá no
  cuesta nada—, que es lo que vacía **la pantalla del alumno**.
- **Y la pantalla de quien apretó el botón no espera ese aviso**: recarga ahí mismo
  y lo dice. Depender de que un aviso dé la vuelta por la red para confirmar algo
  que uno acaba de hacer es la misma apuesta que ya se perdió una vez.
- El aviso de confirmación dice que **se borran también los mensajes del alumno**:
  es lo que pasa, y un «vaciar» que dejara los suyos no vaciaría nada.

**Al tocar el chat, correr `node herramientas/verificar-chat-clase.js`** (con el
sitio en localhost:8777, playwright y `npm install chess.js@0.10.3`). Su doble
**no dispara ningún aviso de Realtime**, igual que la base cuando el DELETE va sin
su fila: si la página volviera a depender del aviso, la prueba falla. Comprueba
que el borrado vaya filtrado por `student_id` y no por `sender_id` —con el filtro
equivocado quedaría media conversación—, que sea **un solo filtro**, que la lista
quede vacía en pantalla, y que a la alumna no se le pinte ni el botón de vaciar ni
el selector de con quién hablar. Está probado que falla de verdad: sin el
`loadChatMessages()` del final, los tres mensajes siguen en pantalla.

### Los dos tableros del alumno llevan coordenadas

`question-board` (la pregunta) y `practice-board` (la práctica contra el motor) son
overlays a pantalla completa con un tablero tan grande como el principal, y eran
los únicos tableros del sitio sin las coordenadas de afuera. Ahí el alumno está
**solo**: el profesor no le está señalando la casilla y no tiene al lado el cuadro
de comandos. Y en el resto del sitio —Mates, Ejercicios por tema, 4×4, el
diagnóstico— ya las tiene siempre, así que su ausencia justo acá se nota.

- Es el mismo `externalCoords` del tablero principal (`_setupExternalCoords` de
  `js/clases-board.js`), no un dibujo aparte. Se giran solas con el tablero, que es
  lo que hace uno de verdad cuando al alumno le tocan las negras.
- **El tope de ancho se lee tal cual esté escrito, no como un número de píxeles.**
  El patrón entendía solo `max-w-[560px]`, que es lo que traía `#chessboard`; los
  dos overlays usan `max-w-[min(92vw,560px)]` y se habrían quedado sin tope — el
  tablero en sus 560 px y la fila de letras estirada a todo el ancho de la tarjeta,
  o sea **las coordenadas señalando la columna que no era**, que se ve igual de
  bien y es peor que no tenerlas.
- Las **miniaturas de supervisión** del profesor siguen sin ellas a propósito: son
  de mirar de lejos y a ese tamaño las letras no se leerían.
- **El tope de ancho se muda al envoltorio como CLASE, no como estilo en línea**, y
  esa es la segunda vez que este mismo defecto aparece por otra puerta. Desde que
  las coordenadas van afuera, **quien decide cuánto mide el tablero es el
  envoltorio** —el tablero es `w-full` dentro de él— y la fila de letras se reparte
  ese mismo ancho: un tope que se quede pegado al tablero lo encoge sin encoger la
  fila.
  - Lo que lo rompió fue la regla `@media (max-height: 800px)` de `css/styles.css`,
    la que achica el tablero para que la clase en vivo quepa sin scroll en un
    laptop de 13". Está escrita con **dos ids** justamente para ganarle a la
    utilidad `max-w-[…]` de Tailwind… pero le seguía aplicando el tope **al
    tablero**, que ya no era quien mandaba: en una pantalla de 800 px o menos el
    tablero se quedaba en 420 px dentro de un envoltorio de 539 y las **ocho letras
    quedaban repartidas sobre 539** — o sea las coordenadas señalando la columna
    que no era, en **los tres tableros de la clase** (el de la pizarra, el de la
    pregunta y el de la práctica). Ningún error, y solo en pantallas bajas: en un
    monitor alto se veía perfecto.
  - Y el estilo en línea era lo que lo hacía imposible de arreglar desde el CSS:
    **un estilo en línea le gana a cualquier hoja**, así que mientras el envoltorio
    llevara `style="max-width:…"` ninguna regla podía alcanzarlo. Mudando la clase,
    el envoltorio queda sujeto a las mismas reglas que el tablero y las dos medidas
    vuelven a salir del mismo lugar.
  - El selector del envoltorio va **dentro de la misma regla** que los tres
    tableros, para que el número siga escrito una sola vez.
- **Se mide en DOS alturas de ventana, y por eso son dos.** Todo lo que cuelgue de
  `@media (max-height: 800px)` existe solo por debajo de esa altura: con un solo
  tamaño se mira la mitad de los casos, y fue justo por ahí que esto se rompió sin
  que nadie se enterara. `verificar-sesion-curso.js` redimensiona y vuelve a medir,
  lo que de paso comprueba que el tope siga saliendo del CSS y no de un número de
  píxeles calculado una vez al montar. **Y mide también `#chessboard`**, el tercero
  que se rotula por fuera y el único que ve toda la clase: no lo miraba ninguna
  prueba, así que se desalineó con los otros dos en silencio. Está probado que
  falla de verdad: dejando el tope pegado al tablero saltan 5 comprobaciones, y
  volviendo a mudarlo como estilo en línea, las mismas 5.

### Las miniaturas de la práctica: a 16 px no se distingue una pieza

Mientras la clase practica contra el motor, el profesor ve una miniatura por alumno
debajo de su tablero. Es la pantalla con la que decide a quién ayudar, y estaba
ilegible de dos maneras a la vez — las dos calladas, porque las tarjetas se pintan
igual y con la posición correcta:

- **Las tarjetas topaban en 160 px**, o sea casillas de 16 px y piezas de 10. El tope
  fijo es una decisión que se queda (con `1/N` del ancho, dos alumnos se veían
  enormes y, peor, **todos cambiaban de tamaño en cuanto se conectaba uno más**,
  justo mientras se los está mirando), pero el número estaba mal: **190 px** es lo
  más chico donde la pieza se reconoce de un vistazo y siguen entrando tres por fila.
- **La pieza se dibujaba con el glifo Unicode.** El de las blancas (♔♕♖) es un
  contorno hueco, así que para no confundirse con las negras se apoya en un
  `text-shadow` de 1 px en las cuatro direcciones (ver `css/styles.css`). A 10 px ese
  contorno es el 10 % del glifo: le rellena los huecos y **las blancas se ven tan
  oscuras como las negras**. Agrandar la tarjeta no lo arregla — está medido: a 220 px
  con glifo las dos filas de torres siguen costando.

**En `compact` manda el set dibujado** (`js/chess-piece-svg.js`), pase lo que pase con
la preferencia de pieza y con el tema divertido: tiene relleno sólido, así que se
distingue en cualquier tamaño, y un emoji a 20 px tampoco dice qué pieza es. **No le
cambia el tablero a nadie**: el suyo sigue con lo que eligió en Configuración — `compact`
lo usan solo estas miniaturas. Y el factor de tamaño dejó de ser uno solo: 0,62 es la
fracción que pinta un glifo de texto dentro de su em, pero la pieza dibujada mide 1 em
exacto, así que con 0,62 quedaba flotando en el medio desperdiciando un tercio de la
casilla — va en 0,82.

Dos cosas más de la misma tarjeta, que se rompían igual de calladas:

- **La barra de evaluación era blanca sobre una tarjeta blanca.** Lo blanco es la
  ventaja de las blancas, como en cualquier tablero, pero sin borde esa mitad no se
  veía y la barra se leía al revés — se veía «lo que falta». Lleva borde, y su
  `aria-label` dice en palabras quién va mejor: era un `role="img"` cuyo nombre fijo
  («Barra de evaluación») no decía nada de la partida.
- **De qué color juega el alumno iba pegado al final del nombre**, que se trunca. Con
  un nombre largo —el caso de todos los días— se perdía siempre, y es justo el dato
  que dice cómo leer el tablero, porque se gira según su color. Va afuera y con
  `shrink-0`; el nombre se encoge con `min-w-0`.

`verificar-sesion-curso.js` lo comprueba midiendo la pantalla: qué se dibujó de
verdad (no la preferencia guardada), el alto real de la pieza contra el de su casilla,
que la barra se separe del fondo y que el color se siga viendo con un nombre largo.
Está probado que falla de verdad: con el código de antes saltan seis comprobaciones,
la primera diciendo «pintó ♜, que a esta escala no se distingue».

`verificar-sesion-curso.js` lo comprueba midiendo en el navegador: que cada letra
caiga sobre su columna y cada número sobre su fila —contra las casillas de verdad,
por su `data-square`, no contra lo que diga la página—, que las etiquetas se giren
con el tablero y que el tablero siga cuadrado. Su doble acepta **filas de
arranque** para sembrar una pregunta abierta o una ronda de práctica: sin eso los
dos overlays del alumno no se pueden ni ver.

### Táctica por tema: la vista previa y su botón

- **El tablero de la vista previa lo dibuja el mismo diagrama de ejemplo que los
  artículos** (`js/article-example-board.js`, que ahora exporta
  `window.ExampleBoard`). Estaba copiado dentro de `sesion.html`, y la copia ya
  se había separado del original por donde se separan siempre: dibujaba las
  piezas con el `font-size` fijo de 24 px del CSS —pensado para un tablero
  grande— dentro de casillas de 22 px, así que **la pieza era más grande que su
  casilla**; y no entendía el juego de piezas ilustrado, así que a quien lo
  tuviera elegido le salían aquí las de texto. El original **mide la casilla ya
  renderizada** y ajusta la pieza a ella. La vista previa dice además de quién
  es la jugada, que antes había que deducir de la posición.
- **"📥 Al tablero" y "❓ Preguntar" no son lo mismo, por eso son dos botones.**
  El primero transmite solo la posición, para explicarla; el segundo además abre
  la pregunta. Con un solo botón había que preguntar para poder enseñar el
  ejercicio, y entonces el alumno ya está contestando mientras se explica.
- **El rótulo de cada ejercicio va ARRIBA y sus botones DEBAJO**, como en el
  panel de Archivos y en el del plan de clase. Estaban en una misma fila, con el
  grupo de botones en `shrink-0`, y ahí está la trampa: **`shrink-0` y
  `flex-wrap` se contradicen** — el grupo crece hasta su ancho de contenido en
  vez de envolverse, así que el `flex-wrap` no llega a aplicarse nunca. La
  columna del profesor mide 320px fijos y los tres botones no caben: «❓
  Preguntar» quedaba 40 px FUERA del panel, cortado contra el borde y sin forma
  de apretarlo, y «ELO 1397» se partía en tres renglones para hacerle sitio. No
  daba ningún error — la lista se pintaba entera —, así que solo se descubre
  mirando la pantalla. `verificar-sesion-curso.js` mide ahora el rectángulo que
  calcula el navegador, no la clase; está probado que falla de verdad: con la
  fila de antes salta con 18 de 54 botones fuera.

**Al tocar la lección de curso de la clase, los visores o la vista previa de
Táctica, correr `node herramientas/verificar-sesion-curso.js`** (con el sitio en
localhost:8777, playwright y `npm install chess.js@0.10.3`). Existe porque
`sesion.html` está detrás del login **y** detrás del rol: `verificar-css.js` abre
las páginas sin cuenta y no ve nada de esto. Comprueba, en un navegador de
verdad, que al alumno no se le pinte ni un carácter de la lección **aunque su
fila de `game_state` traiga `shown_curso` puesta** (el resto de antes), que abrir
la lección no mande ni un `update`, que el botón mande la posición que está en
pantalla —contra el archivo de datos del curso, leído aparte— antes y después de
avanzar una jugada, y que en la vista previa **la pieza quepa en su casilla**
(se miden los dos en el navegador, no la clase ni el CSS).

### "Jalar un archivo a la clase" tiene las mismas tres acciones que Táctica

El panel de Archivos (`toggle-archivos-btn` en `sesion.html`) lista los PGN que
el profesor subió en `partidas.html` —cada partida de un `.pgn` con varias
queda en su propia fila de `archivos_pgn`, así que un archivo con varios
ejercicios ("Position 2, 1 Move", "Position 3, 1 Move"…) ya llega separado uno
por uno—. Antes solo tenía "Cargar" (la línea entera, jugada a jugada, con
`board.loadMoves`); ahora cada fila suma lo mismo que ya tenía Táctica:

- **👁 Vista previa**, con el mismo `renderTacticsPreviewBoard()` de Táctica —no
  una segunda copia— dibujando la posición de **salida** del PGN (la de
  `archivoStartFen()`, sacada del propio PGN en memoria: el header `FEN` si lo
  trae, o el inicio de siempre). No la posición final (`fen_final`, que sí vive
  en la base): la de salida es la que identifica al ejercicio y la que tiene
  sentido preguntar o practicar.
- **📥 Cargar**, **❓ Preguntar** y **🎯 Practicar** pasan las tres por
  `aplicarPosicionEnClase()`, como cualquier otra puerta que pone una posición
  en el tablero. `Cargar` **mandaba antes la línea entera reproducida con
  `board.loadMoves()`**, o sea la posición FINAL del PGN —jaque mate incluido
  cuando lo traía—, así que la clase veía el desenlace del ejercicio apenas se
  elegía el archivo, sin que se hubiera jugado ni una jugada delante de nadie.
  Ahora manda la misma posición de SALIDA que Vista previa: la clase arranca
  limpia, sin las variantes de la línea anterior colgando (eso ya lo hace
  `aplicarPosicionEnClase()` con `clearVariantTree()`), y la línea se juega en
  vivo desde ahí, jugada por jugada, con el mismo mecanismo de cualquier
  partida (`onMove` → `pushBoardState()`) — no con una reproducción instantánea
  que el resto de la clase no llega a ver. `Preguntar` calcula `expected_plies`
  del propio `move_count` del archivo (con el mismo tope de 6 que usa Táctica);
  `Practicar` inserta en `practice_sessions` con el nivel que esté elegido en
  la pestaña Practicar —el mismo insert que `start-practice-btn`, solo que con
  el fen del archivo en vez de `board.fen()`.

### Buscar un ejercicio es mirarlo: «Ver todas las posiciones»

Las dos listas de material del profesor —los PGN de Archivos y los ejercicios de
Táctica— tienen la posición de cada fila **escondida detrás de su propio «👁
Vista previa»**, y el rótulo de la fila no dice nada de ella: «Position 4, 1
Move» o «3. ELO 1397» no distinguen un mate en dos de un final de torre. Así que
para encontrar cuál dar había que abrir y cerrar de a una, con la clase delante.
No fallaba nada: la lista se pintaba entera y el ejercicio estaba ahí — solo que
no había forma de reconocerlo sin destaparlo.

El interruptor de cada lista las destapa todas, y con él encendido **cada fila
NACE destapada**: al cambiar de tema, de dificultad o de carpeta no hay que
volver a apretarlo. Eso es lo que hace que sirva para buscar — si se volviera a
apagar en cada paso de la cascada, buscar costaría lo mismo que antes.

- **Se recuerda en el APARATO** (`localStorage`), como el tema, el Modo Adaptado
  o la clase elegida: es de cómo se está mirando la lista, no de quién mira.
- **Una lista no enciende la otra**, cada una con su clave: son de tamaños muy
  distintos —cientos de PGN contra treinta y pico de ejercicios— y no hay razón
  para que destapar los archivos destape la táctica.
- **Una por una se sigue pudiendo**, que es la mitad del pedido: el interruptor
  decide con qué estado NACE cada fila y no le impone el suyo después, así que
  con todo destapado se puede cerrar la que estorba.
- **El interruptor dice lo que va a pasar**, no el estado en que está («👁 Ver
  todas las posiciones» / «🙈 Ocultar las posiciones»), igual que el «🙈
  Ocultar» de cada fila. Y no se ofrece cuando no hay archivos: un control que no
  cambia nada.

**El tablero se dibuja cuando la fila ENTRA EN PANTALLA**, no al destaparla ni
todos de golpe (`crearVistaPreviaLote()`, un `IntersectionObserver` que las dos
listas comparten — escrito dos veces se separaría a la primera corrección, como
`renderTacticsPreviewBoard()`). Son dos fallas distintas y las dos son calladas:

- Dibujar las 34 posiciones de una tanda de táctica —o los cientos de PGN de un
  profesor— en el mismo cuadro son miles de casillas de una vez: el panel se
  queda congelado unos segundos **en medio de la clase**.
- Y el tamaño de la pieza **se mide sobre la casilla ya renderizada** (ver
  `sizePieces()` de `js/article-example-board.js`), así que dentro de una carpeta
  cerrada —un `<details>`, que es como se agrupan los archivos— esa medida es
  **cero** y el tablero saldría con las piezas del tamaño que no era. Con el
  observador, lo que está guardado en una carpeta se dibuja al abrirla, ya
  medible.

**Al tocar esto, correr `node herramientas/verificar-sesion-curso.js`.** Lo que
mira es lo que se rompe callado: que **cada fila dibuje LA SUYA** —treinta
tableros pintando todos la misma posición se ven perfectos, así que se compara el
patrón de casillas ocupadas de cada uno contra la FEN que le toca, sacada del
primer campo de la propia FEN y no de la página—, que la del PGN sea la posición
de **salida** y no la final, que la de la **carpeta cerrada espere** a que se
abra y aparezca medida, que **bajando por la lista se llegue al último ya
dibujado** (la lista de Táctica tiene su propio scroll: un observador que no
viera lo que entra por ahí dejaría la galería en blanco), que al cambiar de tanda
**nazcan destapadas**, que una lista no encienda la otra y que abrirlas una por
una siga funcionando. Está probado que falla de verdad: dibujándolas todas de
golpe saltan 3 comprobaciones, sin la persistencia 1 y cruzando las posiciones 8.

### Los Tipos de entrenamiento, en la clase

La pestaña **"🧠 Entrenamientos"** del profesor lista los catorce Tipos de
entrenamiento de `entreno/tipos.html` (ver «Los Tipos de entrenamiento» en
entrenamiento.md) en cascada tipo → nivel → ejercicio, con las mismas
posiciones (`entreno/data/tipos.json`) y el mismo catálogo
(`js/tipos-catalogo.js`). Es de las «avanzadas»: en modo sencillo se esconde,
como Táctica.

- **Toda posición entra por `aplicarPosicionEnClase()`**, como Táctica y
  Archivos. Cada fila trae «👁 Vista previa» (el mismo lote de
  `crearVistaPreviaLote()`, con su propia clave) y «📥 Al tablero».
- **Lo que es la respuesta no viaja.** La opción buena del Detective, la
  amenaza, qué candidatas pierden, el número del motor o el mínimo del final
  van en «🔎 Respuesta», que se abre solo en la pantalla del profesor (con
  `aria-expanded`) y ARRIBA de la vista previa: la lista tiene su propio
  scroll, y debajo de un tablero quedaba fuera de la vista.
- **Cada tipo usa la herramienta de la clase que ya existe**, no una nueva:
  ¿Qué quiere el rival? «Preguntar» abre la pregunta de siempre con la
  posición del RIVAL (la respuesta correcta es su amenaza, y la referencia del
  motor la encuentra); Descarte «Preguntar» es «¿qué jugarías?»; Con lo justo
  «Practicar» arranca `practice_sessions` con el final y el motor al máximo;
  Siete diferencias tiene «📥 A al tablero» y «📥 B al tablero», y
  «❓ Preguntar la refutación» abre la pregunta con B DESPUÉS del golpe;
  Rey y peón pregunta la única jugada (nivel 3) y practica contra el motor
  (nivel 4); el maestro pregunta la primera posición de su tramo;
  Fotografía «📸 Mostrar N s y ocultar» pone la posición, la muestra y a los N
  segundos pone `pieces_hidden` —la misma columna del botón 🙈 Ocultar—, así
  que las piezas desaparecen de todos los tableros de verdad.

Los tipos 8 a 14 traen del generador su rótulo (`resumen`, que no delata la
respuesta) y su respuesta (`respuesta`), así que el panel no tiene un caso por
tipo para eso. Las partidas del maestro están detrás del candado de los
cursos: el panel las pide al servidor con la sesión del profesor al abrir ese
tipo (ver «Los tipos 8 a 14» en entrenamiento.md).

**Al tocarlo, correr `node herramientas/verificar-sesion-curso.js`**
(prueba «Tipos de entrenamiento en la clase»): que los botones quepan en el
panel, que cada uno mande la posición que es, que la respuesta no llegue a la
base, que la práctica arranque con el final y que Fotografía mande primero la
posición, después `pieces_hidden=false` y a los segundos `true`.

## La clase en vivo, sin ver la pantalla (y lo que quedaba de la Academia)

Se recorrió la Academia como la recorre una persona ciega —Modo Adaptado
encendido, solo teclado, mirando qué anuncia cada control y qué se lee solo— y
la clase en vivo resultó ser **la única parte del sitio que no se podía seguir
con lector de pantalla**, justo la más importante. No daba ningún error: el
tablero se pintaba y se movía, y para quien no lo veía no pasaba nada.

- **Sin el control, las 64 casillas quedaban fuera del teclado**
  (`if (!canInteract) btn.tabIndex = -1` en `js/clases-board.js`), así que no
  había forma de MIRAR la posición que el profesor explicaba. Ahora el tablero
  tiene siempre una parada de tabulador y las flechas lo recorren: **mirar no es
  mover**, solo el clic y la jugada escrita piden el control. Las miniaturas
  (`compact`) siguen fuera, son de mirar de lejos.
- **Las casillas decían «e4» deletreado y «torre blanco»**: ahora «eva 4, torre
  blanca», como en el resto del sitio. Y **con las piezas ocultas la casilla no
  dice qué hay**: «Ocultar» es un ejercicio de memoria, y si el nombre de la
  casilla lo contara, quien usa lector de pantalla lo tendría resuelto y los
  demás no.
- **`js/clase-adaptada.js`** le pone a los tres tableros de la clase (pizarra,
  pregunta y práctica) el mismo recuadro de Entrenamiento: se escribe «Cf3» o se
  pregunta «posición», «caballos», «qué hay en e4».
  - **La jugada escrita entra por `board.jugar()`, la MISMA puerta que el clic**
    (se sacó de `_onSquareClick`). Con su propio camino, el día que cambiara el
    clic la jugada escrita dejaría de contar como respuesta o de llegarle al
    profesor.
  - **Se anuncia la jugada, no la posición**: la posición queda escrita encima
    del recuadro pero muda (`posicionViva: false`, opción nueva de
    `js/cuadro-comandos.js`). Dictar treinta y dos piezas en cada jugada del
    profesor tapa lo único que cambió — la misma corrección que ya se hizo en
    Juegos. Qué cambió lo decide `anunciarCambio()` comparando lo que había en
    el tablero con lo que llegó, así que el eco de la jugada propia no se anuncia
    dos veces.
  - **Con las piezas ocultas el recuadro tampoco las cuenta**: ni la posición ni
    las preguntas. Se dice qué pasa y las jugadas se siguen anunciando, que es lo
    que ven los demás.
  - Sin el control, escribir una jugada **dice por qué no** («Ahora mueve tu
    profe…») y no manda nada a la base.
- **La pregunta y la práctica son diálogos** (`role="dialog"`) que **se llevan el
  foco al abrirse**, y sus renglones de estado son regiones vivas. Ojo con el
  foco: al cargar la página la pregunta abierta se pinta ANTES de destapar
  `#app`, y el navegador no enfoca lo escondido — no falla nada, el foco se queda
  donde estaba. Por eso `enfocarCuandoSeVea()`. Y `#status-banner` ahora es
  región viva: es el que dice «¡El profesor te dio el control!».

Lo demás que salió del mismo recorrido:

- **Ejercicios por tema decía «Haz clic en la pieza»** también en Modo Adaptado,
  y quién juega y qué buscar vivían en una franja que no se anuncia. Ahora el
  aviso que se lee dice «Juegan blancas: encuentra el mate» con la instrucción de
  cada modo, y el foco va al recuadro. Sus 80 botones decían todos «Resolver»:
  llevan el tema y su grupo escondidos a la vista (hay temas con el mismo nombre
  en dos grupos). Y la página tenía **dos `<body>` y dos «Saltar al contenido»**.
- **Abrir una lección o una serie dejaba el foco en el `<body>`** (el botón se va
  con la lista) en Aprender, Practicar y Desafíos: ahora va al título. En Temas,
  en Modo Adaptado, directo al recuadro.
- **En el celular el Modo Adaptado no se encendía nunca solo**: la detección es
  por el primer Tab y por «contraste alto», y con TalkBack o VoiceOver no hay Tab.
  `js/adaptive-mode.js` pregunta ahora UNA vez, en aparatos táctiles y solo
  mientras la preferencia no esté elegida, justo después de «Saltar al
  contenido». En la computadora no, que ahí la detección ya funciona.
- **Los emojis de títulos y tarjetas se leían en voz alta** («persona levantando
  pesas, Entrenamiento»): 107 títulos del sitio los llevan ahora en un
  `<span aria-hidden="true">`, y los iconos de las tarjetas del panel también. Al
  escribir un título con emoji, envolverlo.
- «Activar voz» tiene un nombre fijo que dice para quién es («solo si no usas
  lector de pantalla»): con lector encendido, esa voz habla encima de la suya.

**Al tocar la clase en vivo, `js/clase-adaptada.js`, `js/clases-board.js`, los
títulos o el ofrecimiento del modo, correr `node
herramientas/verificar-clase-adaptada.js`** (con el sitio en localhost:8777,
playwright y `npm install chess.js@0.10.3`). Reusa el doble de
`verificar-clase-registrada.js`, que ahora deja empujar un cambio de la base con
`window.__cambioEnBase(tabla, fila)` como haría Realtime —sin eso no hay forma de
probar qué oye la alumna cuando el profesor mueve—. Comprueba la parada de
tabulador y las flechas, qué dice una casilla, que «posición» conteste, que sin
control no se mande nada, que la jugada del profesor se anuncie sin dictar la
posición, que con el control la jugada escrita llegue a la base como la del
clic, que **con las piezas ocultas no se escape ni una**, que la pregunta se
lleve el foco y se conteste escribiendo, lo de Temas, el foco de las lecciones,
la pregunta en el celular (y que en la computadora no salga), y que ningún h1-h3
del sitio deje un emoji a la vista del lector. Está probado que falla de verdad:
con el `js/clases-board.js` de antes saltan las tres primeras.

Lo que **no** se cambió, a propósito: los tres botones propios de Mates, Aprender
y Coordenadas («Modo normal», «Adaptado», «Activar voz») siguen ahí en vez del
interruptor del encabezado, porque esas páginas los usan para más cosas que
encender el modo; y las regiones vivas de cada lección de un curso siguen como
estaban: están vacías hasta que se marca una lección, así que no hablan solas.
