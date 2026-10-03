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

- **Los nueve botones van en dos grupos, y el rótulo dice QUIÉN LO VE**: «Tu
  material — solo lo ves tú» (Curso, Archivos, PDF, Armar posición) y «El
  tablero — lo ve toda la clase» (Reiniciar, Borrar flechas, Ocultar, Guardar
  PGN y Tiempo para pensar). No
  es una agrupación estética: es **la misma línea que ordena toda la clase en
  vivo** —el material del profesor no es el de la clase— puesta donde de verdad
  hace falta saberla, que es antes de apretar. Sin ese rótulo son ocho botones
  iguales y ninguna pista de cuál se puede tocar con la clase delante.
- **Las pestañas van en el orden de la clase**, que es el orden en que se usan:
  qué voy a dar (Mi plan) → qué le pongo delante (Táctica, Habilidades) → qué
  le pido (Preguntar, Practicar).
- **La que abre sola la primera vez es «Mi plan»**, o sea `TEACHER_TABS[0]`:
  es lo único que contesta «¿qué voy a dar?» y estaba quinta. Abría
  «Controles», cuyo contenido era **un párrafo explicando dónde estaban los
  otros ocho botones** — una pantalla que necesita explicarse es una pantalla
  mal ordenada.
- «✏️ Editar» pasó a **«✏️ Armar posición»**: lo que hace no es editar nada que
  ya exista, es poner una posición en el tablero a mano.
- Después de la primera vez **se recuerda la última pestaña abierta**, como
  antes: el orden decide dónde se entra, no dónde se vuelve. Una guardada que
  ya no existe («alumnos», «controles») abre «Mi plan».

#### La barra del tablero, de solo iconos

Lo pidió el dueño del sitio: las dos filas de botones de debajo del tablero
(girar, coordenadas, proyector, como alumno, control remoto y ◀ ▶ arriba;
Reiniciar, Borrar flechas, Ocultar y Guardar PGN en la tarjeta de abajo)
ocupaban demasiado. Ahora son **una sola fila de botones de solo icono**
(`#barra-tablero`) y cada uno dice lo que hace al pasar el ratón.

- **El texto no se fue: es el rótulo.** Cada botón lleva su
  `.boton-icono-ayuda`, escondida como `sr-only` y mostrada encima al pasar el
  ratón **o al llegar con Tab**. Es a la vez su nombre para el lector de
  pantalla (el icono va `aria-hidden`). No es `title`: no sale con el teclado
  ni en el celular, tarda en aparecer y el lector lo lee junto con el nombre.
- **Quién lo ve sigue diciéndose.** Los cuatro que tocan el tablero de la clase
  van en su grupo, `#botones-tablero`, con `aria-label="El tablero — lo ve
  toda la clase"`, y la barra separa los grupos con una raya: para todos
  (girar, coordenadas), lo que ve toda la clase, recorrer la partida, y las
  otras ventanas (proyector, como alumno, control remoto). En la tarjeta de
  abajo, con el mismo rótulo de siempre, quedan el tiempo para pensar, la
  ayuda de las flechas y sus colores.
- **«Levantar la mano» conserva su texto**: es lo único que el alumno toca
  ahí, y un 🖐️ solo no le dice a un niño qué pasa si lo aprieta.
- 44 px en el celular (para el dedo), 36 en la computadora; ◀ ▶ pasaron de 32 a
  36 para que la fila sea pareja. «👁️ Como alumno» pasó a 🎓, porque 👁️ es
  también el de «Mostrar las piezas».
- `verificar-sesion-orden.js` mide que el rótulo no se vea quieto y sí al pasar
  el ratón (cambiándolo a `:active`, salta), que sea el nombre accesible y que
  el grupo traiga sus cuatro botones en orden.

#### Tiempo para pensar, a un toque, y el tablero más arriba

Lo pidió el dueño del sitio, después de la barra de iconos: que el tablero
quedara entero a la vista, sin la tarjeta «El tablero — lo ve toda la clase».

- **Debajo de la barra solo queda «⏳ Tiempo para pensar»** (y los colores de
  las flechas). Al tocarlo se abre dónde elegir el tiempo y qué pensar
  (`aria-expanded`, el foco va al tiempo); «Empezar la cuenta» la arranca y la
  vuelve a cerrar. El rótulo «lo ve toda la clase» ya no hacía falta escrito
  ahí: los cuatro botones que tocan el tablero lo llevan en su grupo de la
  barra (`aria-label`), y el aviso del tiempo lo ve toda la clase de por sí.
- **La ayuda de las flechas es el rótulo de los colores**: con ratón sale al
  pasar por encima o al llegar con Tab (`aria-describedby` la une a los
  colores). En el celular no hay por dónde pasar el ratón, así que ahí se
  queda escrita, como antes.
- **Una sola franja arriba del tablero.** Al profesor ya no se le pone «Mueve
  el tablero: cada jugada se transmite…»: la franja de la clase (abierta o no,
  con su botón) ya dice lo que pasa. La de estado queda vacía y, vacía, sin
  alto (`#status-banner:empty`), hasta que haya algo que avisar; no se
  esconde con `display: none` porque es una región viva y el aviso que llegue
  podría no leerse. La franja de la clase quedó más baja. Con todo, en 1920 ×
  950 el tablero pasó de empezar a 352 px a 239, y su barra se ve entera.
- **«↶ Deshacer jugada» es un icono más de la barra**, al lado de ◀ ▶. Sigue
  apareciendo solo cuando se puede deshacer (`.boton-icono.hidden`).
- **«🔎 Herramientas en grande» se acortó a «🔎 En grande»** para caber en un
  renglón con «Volver al modo sencillo».
- `verificar-sesion-orden.js` mide que la franja vacía no ocupe alto y que
  debajo de la barra solo quede el botón; `verificar-clase-movil.js`, que la
  ayuda no se vea quieta y sí al pasar el ratón; `verificar-clase-pensar.js`,
  que se abra, lleve el foco y se cierre al empezar. Rompiendo las dos reglas
  de CSS, saltan.

#### La clase en vivo, reordenada

Lo pidió el dueño del sitio: lo que se usa todo el tiempo
tenía que estar a la vista sin buscarlo.

- **«El tablero — lo ve toda la clase» va DEBAJO del tablero** (sus cuatro
  botones subieron después a la barra del tablero, como iconos: ver «La barra
  del tablero, de solo iconos»)
  (`#toolbar-tablero`, en la columna del tablero, debajo de la barra de girar
  y recorrer), no en la columna de herramientas. Son los botones que tocan lo
  que la clase está mirando, y se usan a cada rato: al lado de lo que cambian
  se encuentran sin pensar. Con ellos bajaron la ayuda de las flechas y los
  colores con que se dibujan, junto a «🧹 Borrar flechas» (antes decía solo
  «Flechas», que no dice qué hace). En el proyector y el control remoto no se
  ven (no llevan `proyector-se-ve` ni `control-se-ve`).
- **El motor y los alumnos conectados se ven siempre**, arriba de la columna
  y en ese orden, con cualquier pestaña abierta. «Alumnos» dejó de ser
  pestaña: es a quién se le está dando la clase (quién llegó, quién pide la
  palabra, a quién darle el control), y escondida detrás de un clic no se
  veía quién levantaba la mano. Dentro, la lista va primero y lo demás
  (elegir al azar, puntos, equipos) debajo. El aviso de manos levantadas pasó
  de un punto rojo en la pestaña a «✋ Piden la palabra» escrito junto al
  título. Lo que antes abría esa pestaña (dar el turno desde «Llevan un rato
  sin contestar», anotar desde donde se mira, elegir al acabar el tiempo para
  pensar) ahora solo la acerca (`mostrarPanelAlumnos()`), sin cambiar la
  pestaña que el profe tenga abierta.
- **Después, lo que se busca para una actividad**: la tarjeta «Tu material» y
  las pestañas.
- **«➕ Invitar» se quitó de la clase.** Dar de alta a un alumno no se hace
  dando clase: se hace en `formularios.html` («＋ Alumno nuevo»), con el
  mismo `create-student`, la misma casilla de «No tiene correo propio» y el
  mismo cupo. El enlace para que vean la clase sin cuenta, que vivía en esa
  pestaña, quedó en «Alumnos conectados» como un desplegable cerrado: es
  sobre quién mira la clase, no sobre dar de alta a nadie.
- En el celular, los botones de debajo del tablero también miden 44 px, y los
  cinco colores de las flechas son círculos de 44 × 44 (con solo el alto
  quedaban óvalos).

**Al tocar la barra de herramientas o las pestañas, correr `node
herramientas/verificar-sesion-orden.js`** (con el sitio en localhost:8777,
playwright y `npm install chess.js@0.10.3`). Reusa el Supabase de mentira de
`verificar-clase-registrada.js` —dos copias del mismo doble se irían separando a
la primera corrección—. Comprueba que los botones estén en sus dos grupos (y
el de «El tablero» debajo del tablero, centrado con él) y
**que no quede ninguno fuera** (un botón suelto es el principio de la rejilla sin
criterio de antes), que cada rótulo diga quién lo ve, que el orden de las
pestañas sea el de la clase y que la que abre sola sea «Mi plan», que cada
pestaña apunte a **su** panel (un `aria-controls` al de al lado manda a quien usa
lector de pantalla a un sitio que no era), que abrir una herramienta propia **no
escriba en `game_state`** —que es justo lo que promete el rótulo «solo lo ves
tú»—, que el motor y los alumnos conectados se vean con cada pestaña y arriba
de la columna, que «Invitar» ya no esté, y que a la alumna no se le pinte nada
de esto.

### Los alumnos siguen lo que mira el profesor

El profesor puede devolverse en la partida y recorrer variantes sin tocarla
(`board.viewMainAt`, `viewVariantNode`; jugar desde ahí crea una variante en
`variant_nodes`). Eso quedaba **solo en su pantalla**: el profe explicaba la
jugada 12 y los alumnos seguían mirando la 20, y para enseñarles una variante
tenía que jugarla de nuevo en vivo y perder la partida. No daba ningún error:
cada tablero simplemente mostraba otra cosa.

- **Lo que mira el profesor se guarda en `game_state.vista`**: `null` es la
  posición en vivo; si no, `{path, parent, root}` —las jugadas desde el inicio,
  el nodo de `variant_nodes` donde está (o `null` en la línea principal) y la
  jugada de donde nace la variante—. Cada tablero que sigue la clase (alumnos y
  quien supervisa) la muestra con `board.showView()`.
- **Va en la base y no en un mensaje suelto de Realtime**: quien entra tarde,
  recarga o supervisa tiene que ver lo mismo que los demás, y un broadcast solo
  le llega a quien ya estaba conectado.
- **Solo el profesor la cambia**: `protect_game_state_teacher_columns` le
  devuelve la de antes a cualquier otro, igual que las flechas y el control.
  Comprobado impersonando roles: la alumna con el control cambia la fila y la
  vista queda como estaba; el profesor la cambia; una forma que no es
  `{path: [...]}` la rechaza el CHECK `game_state_vista_forma`.
- **Jugar en la partida es volver a ella**: `pushBoardState` manda `vista: null`
  (también «Jugar desde aquí») y `aplicarPosicionEnClase` también. La página
  solo manda la vista cuando cambia (`transmitirVista` recuerda la última), así
  que los ecos de Realtime no rebotan.
- **El alumno ve escrito qué es** (`#vista-profe`): «Tu profe volvió a una
  jugada anterior: 12. Nf3» o «Tu profe está mostrando una variante: 12… Nf6
  13. Bc4», y que la partida sigue guardada. Con el Modo Adaptado se le dice en
  voz. El turno que se muestra es el de la posición que ve.
- **Un alumno con el control no mueve mientras el profe muestra otra
  posición**: su jugada sería sobre la que ve y no sobre la partida. Se le dice
  que espere a que el profe vuelva.
- **◀ y ▶ dentro de una variante se quedan en ella**: ◀ va a la jugada anterior
  de la variante (y de la primera, a la línea principal de donde nace) y ▶ sigue
  por su continuación. Antes ◀ saltaba siempre a la línea principal, y para
  retomar la variante había que buscarla en la lista: justo lo que hace falta
  para ir acumulando variantes sin volver a jugar la posición.
- Al recargar, el profesor retoma su propia vista (la que quedó guardada), en
  vez de dejar a la clase mirando algo que él ya no ve.

**Al tocar la navegación de jugadas, las variantes o `applyGameStateRow`, correr
`node herramientas/verificar-clase-vista.js`.** Reusa el doble de
`verificar-clase-registrada.js`: comprueba lo que manda el profesor con ◀ ▶ ⏮ ⏭,
al crear y extender una variante y al jugar en vivo, y lo que se PINTA en el
tablero de la alumna (las casillas, por su `aria-label`), con su aviso escrito y
sin poder mover mientras el profe muestra otra cosa.

### El PGN de la clase lleva su arranque, sus variantes y sus comentarios

«💾 Guardar PGN» rehacía la línea principal desde la posición **estándar**
(`new Chess()`). Eso perdía tres cosas sin dar ningún error:

- **La posición de arranque.** Casi toda clase empieza con una posición mandada
  (Táctica, un diagrama del curso, «Armar posición»): desde la posición
  estándar chess.js rechaza la primera jugada **en silencio** y el PGN salía
  vacío, con el aviso «Partida guardada y PGN descargado». La línea que se
  archiva al «Jugar desde aquí» tenía el mismo problema, y además su
  `fen_final` salía de la posición estándar.
- **Las variantes** de `variant_nodes`, que son justo el trabajo de la clase.
- **Lo que el profe dijo de cada jugada**, que no tenía dónde guardarse.

Lo arma `js/pgn-clase.js`, una función pura (la usan igual el botón y el
verificador): `SetUp`/`FEN` cuando la posición no es la estándar, la numeración
que sigue la del FEN (una clase que arranca en la jugada 30 con negras empieza
«30… h6»), las variantes anidadas donde nacen —una raíz con `root_ply = n` es
otra jugada en lugar de la n-ésima; una que nace al FINAL de la partida es su
continuación—, el número repetido al volver de una variante o de un comentario
(«31… Kh7», como pide el estándar), los signos como NAG (`$1`…`$6`) y los
comentarios sin `}` (lo cerraría). La fecha es la de Costa Rica. El aviso dice
qué lleva: «3 jugadas, 1 jugada de variante, 1 comentario».

**Los comentarios van en `game_state.comentarios`**, con el CAMINO de jugadas
desde `start_fen` como clave (`"h6 Ra8+"`): así sirve igual para la línea
principal y para cualquier variante, sin una tabla aparte que se desfase del
árbol.

- **Solo el profe los escribe**: `protect_game_state_teacher_columns` le deja
  los de antes a cualquier otro, igual que la vista y las flechas. Comprobado
  impersonando roles: la alumna no los cambia, el profe sí. Un CHECK
  (`game_state_comentarios_forma`) exige un objeto de hasta 64 KB.
- **Se comenta la jugada que se está mirando** (la de la vista o, si no, la
  última): el editor va debajo de «Jugadas», con los seis signos como botones
  con `aria-pressed` y su nombre dicho. El cuadro solo se rellena al CAMBIAR de
  jugada: un eco de Realtime no le borra al profe lo que está escribiendo.
- **La clase lo ve debajo de su tablero** cuando mira esa jugada
  (`#comentario-profe`), con el signo dicho en palabras («31. Ra8+! (buena
  jugada): …») y por `textContent`, porque lo escribió una persona. Con el Modo
  Adaptado se le dice en voz. En la lista del profe la jugada lleva su signo y
  un 💬, y el `aria-label` dice el comentario.
- **Se vacían cuando cambia el arranque** (`aplicarPosicionEnClase`,
  «Reiniciar»): una clave de otra partida no pertenece a esta. Y al guardar uno
  se descartan los de jugadas que ya no están en el árbol, para que la columna
  no crezca con restos.

**Al tocar el PGN, los comentarios o `applyGameStateRow`, correr `node
herramientas/verificar-todo.js clase-pgn`.** Prueba el armador sin navegador
(y que chess.js 0.10.3 lea la línea principal de lo que sale) y la clase con el
doble de `verificar-clase-registrada.js`. Está probado que falla de verdad: con
la posición estándar de antes y sin variantes saltan dos comprobaciones.

### Preguntar con tiempo, con opciones y mostrar lo que contestó la clase

«¿Qué jugarías?» era la única pregunta: sin reloj, sin forma de preguntar una
opinión («¿quién está mejor?», «¿cuál es el plan?») ni de saber si la clase
entendió, y lo que contestaba el grupo lo veía solo el profe, alumno por alumno.
Lo que manda está en la base (migración
`preguntas_con_tiempo_opciones_y_resultados`), comprobado impersonando roles.

- **El tiempo para contestar lo cobra la base.** `questions.tiempo_limite`
  (10 a 900 s) y el trigger `respuesta_calificar_y_plazo` rechaza la respuesta
  que llega después, con 5 s de gracia por la red. La cuenta regresiva de la
  pantalla es solo el aviso: una que viviera solo ahí se salta desde la
  consola. Al alumno se le dice en voz a los 10 s y al terminar, desde una
  región viva aparte: el texto que cambia cada segundo no lo es, o el lector
  lo leería sin parar.
- **El reloj de las preguntas es el de la base.** `created_at` lo pone la
  base, así que la cuenta regresiva (`PreguntaClase.segundosRestantes`) resta
  `RelojServidor.ahora()`, no `Date.now()`, y `sesion.js` mide el desfase al
  entrar (`RelojServidor.iniciar`). Con la hora de cada aparato, a un alumno
  cuyo celular andaba adelantado más que el plazo le salía «Se acabó el
  tiempo: esta vez no alcanzaste a contestar» desde el primer segundo, en
  todas las preguntas (pasó en una votación contra el profe); uno atrasado
  veía tiempo de sobra y la base le rechazaba la respuesta. No daba ningún
  error. Si la medición falla, el desfase queda en cero, como antes. Lo
  revisa `verificar-pregunta-reloj.js`.
- **Una sola puerta crea las de «¿qué jugarías?»**: `crearPregunta()`. Había
  cinco inserts (el botón, Táctica, el plan, los archivos y los Tipos), y el
  tiempo elegido tenía que viajar en todos: el que se olvidara dejaría esa
  pregunta sin reloj, sin ningún error.
- **Las de opciones** (`tipo = 'opciones'`, de 2 a 6) sirven para «¿quién está
  mejor?», una pregunta con opciones propias y el termómetro «¿lo entendiste?».
  **La correcta NO va en `questions`**, que los alumnos leen: va en
  `preguntas_clave`, que solo lee quien la hizo. Con clave, la base califica
  sola; el termómetro no tiene clave. Se crean con
  `hacer_pregunta_de_opciones()` (SECURITY INVOKER), en UNA transacción: con
  dos inserts sueltos, un alumno rápido contestaría entre los dos y quedaría
  sin calificar. Las opciones propias se renumeran si queda una vacía en medio.
- **El termómetro no muestra tablero** y le dice al alumno que nadie ve quién
  eligió qué: para que conteste con sinceridad.
- **Lo que contestó el grupo, sin nombres**: `resultados_de_la_pregunta()`
  (SECURITY DEFINER, con su permiso envuelto en `coalesce`) cuenta cuántos
  eligieron cada opción o cada primera jugada. El profe lo ve siempre; sus
  alumnos, solo cuando él aprieta «📊 Mostrar las respuestas a la clase»
  (`resultados_visibles`, con `aria-pressed`). El alumno lo ve escrito
  («Bb5: 2 alumnos (67 %)») y, en una de jugada, con una flecha por respuesta
  en su tablero. Las barras acompañan: el dato va escrito al lado.
- **Refrescar los resultados no le borra la jugada al alumno.** Cada respuesta
  nueva hace que el profe «toque» la pregunta (una vez por segundo como mucho)
  y el cambio llega por Realtime; si es la MISMA pregunta sin cerrarse, solo
  se repintan los resultados. Volver a armar la tarjeta le reiniciaba el
  tablero a quien iba por la mitad de una respuesta de dos jugadas.
- **El hueco que había**: `protect_answer_grading` corre solo en UPDATE, así
  que un alumno podía INSERTAR su respuesta ya marcada como correcta —y los
  trofeos se cuentan de las correctas—. El trigger nuevo le quita la nota en
  el INSERT a quien no hizo la pregunta. Corre DESPUÉS del viejo (los
  triggers van por nombre), así que en un UPDATE aquel ya devolvió la nota de
  antes y este la recalcula si es de opciones.

**Al tocar las preguntas, correr `node herramientas/verificar-todo.js
clase-preguntas`.** Su doble (el de `verificar-clase-registrada.js`) conoce
`hacer_pregunta_de_opciones` y `resultados_de_la_pregunta`, y expone sus tablas
en `window.__tablas` para que la prueba cambie la base «desde la pantalla del
profe» y avise con `__cambioEnBase`. Está probado que falla de verdad: sin el
tiempo en `crearPregunta` saltan dos comprobaciones, y rearmando la tarjeta en
cada aviso salta la de «no se le borró lo que llevaba jugado».

### Práctica con reloj, partidas entre alumnos y «a ciegas»

Tres herramientas de entrenamiento que faltaban en la clase. Lo que cuenta
está en la base (migración `partidas_y_reloj_de_la_clase`), comprobado
impersonando roles.

- **La práctica contra el motor puede llevar reloj** (1 a 10 minutos, con o
  sin incremento): `practice_sessions.reloj_segundos` / `incremento_segundos`.
  El reloj es del alumno —el motor juega al instante— y **lo lleva su
  navegador**, a propósito: es entrenamiento contra una máquina, no una
  partida puntuable, y validarlo en el servidor como las de `game_rooms`
  sería mucho aparato para nada. Corre solo en su turno; al mover se le
  descuenta lo que pensó y se le suma el incremento, y lo que le queda se
  guarda en `practice_games.reloj_ms`. Al caer, la partida termina con
  `status = 'timeout'`, que el resumen cuenta como derrota. Se le dice en voz
  a los 10 s y al caer, desde una región viva aparte (el texto que cambia
  cada segundo no lo es).
- **Una sola puerta abre la práctica**, `crearPractica()`: había tres inserts
  (el botón, los archivos y «Con lo justo»), y el reloj tenía que viajar en
  todos.
- **Partidas entre alumnos**: «Emparejar a los alumnos conectados» arma al azar
  una partida por pareja, con el ritmo elegido, desde la posición inicial o
  la del tablero de la clase. Son las partidas de siempre (`game_rooms`,
  variante estándar, en `estandar.html`): mismo reloj que valida el servidor,
  misma política de quién puede armar con quién (`puedo_armar_partida_con`) y
  el mismo aviso de pareo que llega a cualquier página (`js/juego-aviso.js`,
  que `sesion.html` ya carga). El que sobra con un número impar **se dice**,
  por su nombre: dejarlo fuera callado es dejarlo sin jugar sin que nadie se
  entere.
  - Quedan ligadas a la clase con el MISMO trigger de las preguntas
    (`ligar_a_la_clase_abierta` sobre `game_rooms`): cualquier partida que el
    profe arme con la clase abierta —también desde Juegos o un torneo— cuenta
    como de esa clase.
  - Desde una posición que no es la inicial, la triple repetición no se
    declara nunca: `js/repeticion.js` reproduce desde la posición estándar y,
    si no llega a la FEN guardada, a propósito no declara nada.
  - La lista de la pestaña dice cómo va cada una y trae «Mirar» (se abre en
    otra pestaña, y el enlace lo dice). Se refresca por Realtime con el filtro
    `created_by`.
- **El resumen del cierre las cuenta**: `resumen_de_la_clase` suma partidas
  (cada una para los dos, desde su lado) y la columna «Partidas con
  compañeros» sale solo si hubo. El profe que jugó con un alumno no aparece
  como alumno de su propia clase.
- **A ciegas**: con «Ocultar» puesto, el alumno no tenía nada que seguir. Ahora
  ve la partida escrita (`#jugadas-a-ciegas`) hasta la jugada que se está
  mirando: eso es el ejercicio de visualización.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-partidas`.**
Está probado que falla de verdad: sin descontar el reloj al mover, o sin
pintar la partida escrita, se cae.

### Antes y después de la clase: el plan marcado, la tarea de repaso y «Tu última clase»

La clase empezaba en «Mi plan» y terminaba en «Cerrar la clase», pero ninguno
de los dos lados se enteraba del otro: el plan no sabía hasta dónde se llegó,
el cierre pedía escribir de nuevo lo que se trabajó, y el alumno se iba de la
clase sin nada en la mano.

- **«☐ Ya lo di» en cada renglón del plan** (`aria-pressed`). Se guarda en
  `clase_plan_hecho` —la clase y el renglón—, y no en el plan: el mismo plan se
  da en varias clases y en cada una se llega hasta donde se llega. Es un hecho
  que el profe afirma, no algo que se pueda deducir de otras filas, así que se
  guarda. La RLS deja escribir solo a quien dio la clase (comprobado
  impersonando: otro profesor no lee ni escribe, el alumno no lee).
- **La nota del cierre se propone sola** con lo que se marcó («Del plan:
  Lucena; Philidor.»), con los títulos y sin los emojis: esa nota termina
  impresa en el reporte de actividades. Solo si está vacía: lo que el profe ya
  escribió no se pisa.
- **Al cerrar queda el enlace a la tarea de repaso**: `tareas.html?clase=<id>`
  marca a los que asistieron (lo lee de `class_attendance`) y pone «Repaso de
  la clase: …» como título. Viaja solo el id de la clase, como la bitácora
  manda solo el id de la nota. El título de la clase le gana al que se propone
  del primer renglón y queda como elegido: cambiar los renglones no lo pisa.
- **«Tu última clase» en el panel del alumno** (`clases.html`): la última clase
  en línea de las dos últimas semanas, con lo que hizo —su fila de
  `resumen_de_la_clase`, que la RLS le da solo a él— y, plegado, lo que
  contestó en cada pregunta de ESA clase, con la opción escrita y si estuvo
  bien. Si no estuvo ni hizo nada en ella, la tarjeta no sale. Lo pinta
  `js/resumen-clase.js`, la misma copia que el cierre y el registro.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-resumen
tareas panel`.** Está probado que falla de verdad: con el enlace sin el id de
la clase salta la comprobación del cierre.

### Repasar mis clases: lo que pasó en la clase no se pierde al cerrarla

La partida de la clase —con su arranque, sus variantes y lo que el profe
comentó de cada jugada— solo la veía quien la guardaba (`saved_games_select`:
`created_by = auth.uid()`), y solo si se acordaba de «💾 Guardar PGN». El
alumno que quería repasar lo que vio no tenía cómo. Ahora
(`repasar-clases.html`, tarjeta «🎞️ Repasar mis clases» en Aprender, junto a
Estudio):

- **La partida queda ligada a su clase** (`saved_games.class_session_id`). La
  pone la base con el trigger que ya usan preguntas, prácticas y partidas de
  la clase, `ligar_a_la_clase_abierta`: la clase abierta de quien guarda. Lo
  guardado fuera de clase queda sin clase y sigue siendo solo del profe.
- **La ve quien ASISTIÓ** (y, si el profe la compartió al cerrar, sus alumnos que
  faltaron: ver «La clase como lección para quien faltó»): `saved_games_select_asistentes` mira
  `class_attendance`; un compañero que no fue no la recibe. Como el resto de
  la clase, solo con el acceso vigente (`saved_games_exige_acceso_sel`,
  restrictiva). El insert solo deja ligarla a una clase propia. Comprobado
  impersonando roles en SQL (migración `20260928235055`): el profe la ve, la
  alumna que asistió la ve, el compañero que no fue no, y colgarla de la clase
  de otro profe se rechaza.
- **Al cerrar la clase se guarda sola** (`guardarLaClaseAlCerrar()`), ANTES
  de marcarla cerrada —si no, el trigger ya no la encuentra abierta—, salvo
  que no tenga jugadas o que ya se haya guardado igual con el botón
  (`firmaDeLaClase()`). Si falla, la clase se cierra igual: el registro y la
  asistencia importan más.
- **Se guarda la clase en crudo** (`saved_games.datos`: la forma de
  `js/pgn-clase.js`) al lado del PGN, en los tres guardados (el botón, la
  línea archivada al «Jugar desde aquí» y el del cierre). El visor recorre el
  MISMO árbol del que sale el PGN (`PgnClase.arbol`, que se exportó para
  esto): la línea principal, cada variante entre paréntesis donde nace, el
  comentario con el signo dicho en palabras y por `textContent`. Las partidas
  de antes (sin `datos`) muestran la línea del PGN y lo dicen.
- Se recorre con botones o con las flechas, Inicio y Fin del teclado; el
  estado («Jugada 2… Cf6 (variante)») es región viva.
- `node herramientas/verificar-todo.js repasar-clases` lo prueba en un
  navegador y comprueba que los tres inserts de `sesion.js` lleven `datos` y
  que el guardado del cierre vaya antes del `ended_at`.

### El alumno elegido al azar para responder

«🎲 Elegir a un alumno al azar», en «Alumnos conectados»: sale uno de los
conectados y al elegido le sale en grande en su pantalla, «¡Te eligieron para
responder!». El profe ve a quién eligió y ahí mismo le puede dar una insignia o
trofeos (el mismo panel de Trofeos de su renglón), elegir a otro o marcar que ya
respondió.

- **Cuántas veces le tocó a cada uno queda en la base** (`clase_elegidos`: una
  fila por elección, con su clase). El profe la ve escrita en el mismo
  recuadro, primero los que menos llevan —«todavía no», «1 vez», «2 veces»—,
  con los conectados aunque tengan cero y quien ya pasó aunque se haya ido. La
  RLS deja leer y escribir solo a quien dio la clase, y solo sobre alumnos
  suyos (comprobado impersonando: otro profe y el alumno no leen ni escriben, y
  un alumno ajeno no se puede anotar). Son pocas filas por clase, así que se
  cuentan en la página sin miedo al tope de mil.
- **El sorteo elige entre los que llevan menos**
  (`PartidasClase.elegirConMenos`), con esa misma cuenta: nadie repite hasta
  que les toque a todos, y quien se conecta tarde (con cero) entra primero.
  Antes la cuenta vivía en la memoria de la página y se perdía al recargar.
- **Va en `game_state.elegido` ({id, at, nombre}) y no en un mensaje suelto de
  Realtime**, por lo mismo que la vista: quien recarga justo en ese momento se
  entera igual. Solo el profe lo cambia (`protect_game_state_teacher_columns`;
  comprobado impersonando: la alumna con el control no se puede elegir sola) y
  un CHECK exige la forma.
- **El texto no tiene género**: «¡Te eligieron para responder!», no «Has sido
  el elegido», porque la cuenta no dice si es alumno o alumna y adivinar se
  equivoca con alguien.
- **El aviso grande sale una vez por elección**: al cerrarlo («¡Voy!») se
  recuerda en la pestaña (`sessionStorage`), así que recargar no se lo vuelve a
  poner encima; queda una franja «Te toca responder» hasta que el profe marca
  que ya respondió. Un aviso de hace más de 15 minutos no se pinta: es de otra
  pregunta. El foco va al botón y con el Modo Adaptado se dice en voz.
- **La ruleta** (los nombres girando un momento) no corre con «reducir
  movimiento», y mientras gira el nombre no es región viva: se anuncia solo el
  final.
- **Los demás ven a quién eligieron**, escrito debajo de su tablero («Tu profe
  eligió a Beto Mora para responder»), sin el aviso grande ni nada que les tape
  la pantalla. El nombre viaja en la misma elección (`elegido.nombre`, lo pone
  el profe desde la presencia): así lo ve también quien recarga antes de que le
  llegue la presencia. Con el Modo Adaptado se dice en voz, una vez por
  elección. Se va cuando el profe marca que ya respondió.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-elegido`.**
Está probado que falla de verdad: sin mostrar el aviso grande, se cae.

### La lista de alumnos conectados, un renglón por alumno

Con 20 alumnos, la lista de «Alumnos conectados» era un desorden: cada uno
traía cuatro controles (📝, 🏆, el color y «Dar control») que no cabían al lado
del nombre y caían en dos renglones más, y el selector de color solo sirve para
el que tiene el control.

- **Un renglón por alumno**: el punto, su foto, el nombre (cortado si no cabe,
  entero al pasar el puntero) y cuatro iconos: 📝 bitácora, 🏆 trofeos, 🎮
  control y 🚪 sacarlo de la clase (ver «Sacar a un alumno de la clase»). Cada uno dice qué hace y a quién (`aria-label`: «Darle el control a
  Ana Rojas»); la leyenda de arriba los explica en palabras. El título dice
  cuántos hay conectados.
- **Lo que es de uno solo va en su segundo renglón**: el color con que mueve y
  «Quitar control» al que tiene el control (se le da con ambos colores y se
  cambia ahí mismo, sin quitárselo); «Darle la palabra» y «Bajar» al que
  levantó la mano. Esos dos renglones van resaltados.
- **El control se ve al toque**: `setActivePlayer` repinta la lista apenas la
  base lo confirma, sin esperar el eco de Realtime.
- «Participación en esta clase» (que repite los 20 nombres) va cerrada de
  entrada, a un clic.
- En el celular, el CSS de la columna de herramientas lleva cada botón a 44 px
  para el dedo (ver «La clase en el celular del profe»).

**Al tocar esto, correr `node herramientas/verificar-todo.js
clase-participacion clase-elegido clase-notas trofeos foto-perfil
clase-movil`.** Está probado que falla de verdad: sin repintar al dar el
control, salta.

### Sacar a un alumno de la clase

Por si alguien entra por error (un alumno de otro grupo del mismo profe, por
ejemplo): el profe lo saca y el alumno deja de ver la clase al instante.

- **Quien decide es la base** (migración `clase_sacados`, comprobada
  impersonando). `clase_sacados` guarda un renglón por clase y alumno, sin
  política de escritura: la escriben `sacar_de_la_clase()` y
  `dejar_volver_a_la_clase()`, que solo deja usar al dueño de la clase o a
  quien administra (`interno.puedo_sacar_de()`). Mientras esté sacado, las
  políticas restrictivas `*_no_sacado` le rechazan, en ESA clase, la
  asistencia, el tiempo en clase, las respuestas a las preguntas (también
  cambiarlas) y los resultados del calentamiento. Una consola no lo salta.
- **No se borra nada.** Dejarlo volver marca `devuelto_at`; sacarlo otra vez
  lo deja en nulo. Lo que hizo antes de que lo sacaran (asistencia, lo que
  contestó) se queda: si el profe se equivocó de alumno, no pierde nada.
  También porque la base pide confirmación para un `delete` en una
  migración, y una que borraba la asistencia al sacarlo se canceló.
- **El profe**: el 🚪 de su renglón, con confirmación («Sacarlo de la
  clase»). Sale de la lista de conectados y aparece en «Sacados de esta
  clase» (cerrada, a un clic), con «↩️ Dejarlo volver». Si una pestaña vieja
  del sacado se sigue anunciando en la presencia, el profe no lo ve.
- **El alumno**: le llega el aviso `sacar` por el canal de presencia. Ese
  aviso lo puede mandar cualquiera conectado al canal, así que no se le cree:
  la página pregunta a la base (`clase_sacados`, que el alumno lee solo lo
  suyo) y solo si es verdad se va: deja de anunciarse, cierra su tiempo en
  clase, se desconecta de todos los canales y ve «🚪 Tu profe te sacó de esta
  clase», con «🔄 Intentar de nuevo» y «Volver a la Academia». El foco va al
  título, para que el lector de pantalla lo diga. Al cargar la página se
  pregunta igual (`checkOpenClassSession`), así que recargar no lo vuelve a
  meter, y no marca asistencia.
- Vale para ESA clase: en la siguiente que abra el profe entra normal.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-sacar
clase-participacion`.** Está probado que falla de verdad: sin la pregunta a
la base al cargar, salta.

### La participación oral: cómo respondió, y la cola de manos levantadas

El turno al azar decía a quién le tocaba, pero no cómo le fue; y «Levantar la
mano» ya existía, pero el profe veía las manos sin saber quién la levantó
primero. Las dos cosas terminan en el mismo registro: `clase_elegidos`, una
fila por turno de palabra (migración `participacion_oral_en_la_clase`,
comprobada impersonando).

- **Cómo respondió**: «✅ Bien», «🤔 Casi» o «Terminar sin anotar». Cualquiera
  termina el turno; los dos primeros anotan `resultado` en la fila de ESE
  turno (la que devolvió el insert, o —si el profe recargó en medio— la última
  sin anotar de ese alumno). La cuenta del recuadro lo dice escrito («2 veces:
  1 bien, 1 casi»). Solo quien dio la clase anota: el alumno lee lo suyo
  (política `clase_elegidos_select_propio`, para «Tu última clase») pero no se
  puede calificar, y otro profe no cambia nada. Un CHECK acepta solo `bien` y
  `casi`.
- **Las manos van en el orden en que se levantaron**: levantar la mano anuncia
  la hora en la presencia (`hand_at`), y la lista del profe pone primero las
  manos, ordenadas por esa hora, con el puesto ESCRITO («🖐️ 1.º»): el orden de
  la lista solo no lo dice. Sin la hora, la lista salía en el orden en que
  llegó cada presencia, que no es el orden en que pidieron la palabra.
- **«🗣️ Darle la palabra»** es un turno más, de origen `mano`, por la misma
  puerta que el sorteo (`darTurno`): le baja la mano, queda en
  `game_state.elegido` con `motivo: 'mano'` y en `clase_elegidos`. A quien la
  pidió le sale «¡Tienes la palabra!» (no «te eligieron»: la pidió él) y los
  demás leen «Tu profe le dio la palabra a …».
- **El resumen de la clase cuenta los turnos**: `resumen_de_la_clase` suma
  `turnos`, `turnos_bien` y `turnos_casi`, y la tabla del cierre, del registro
  y de «Tu última clase» trae la columna «Participación» («3 turnos: 1 bien,
  1 casi, 1 sin anotar») solo si hubo.
- La fila de acciones de cada alumno se acomoda en varias líneas: con «Darle
  la palabra» ya no cabía en un celular y el selector de colores quedaba
  cortado.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-participacion
clase-elegido clase-resumen`.** Está probado que falla de verdad: sin ordenar
por la hora de la mano, o sin guardar el resultado, salta.

### La pregunta dirigida y las respuestas en el tablero

Con alguien con el turno (al azar o por mano levantada), «❓ Preguntarle con el
tablero» le hace a ESA persona la pregunta de «¿qué jugarías?» sobre la
posición del tablero. Y cualquier pregunta de jugada (dirigida o para todos) se
ve en vivo en el tablero de cada alumno, como las partidas de Practicar.
Migración `pregunta_dirigida_y_respuestas_en_curso`, comprobada impersonando.

- **`questions.para_alumno`**: la pregunta es de una sola persona. Que los
  demás no la contesten lo pone la base, no la pantalla:
  `respuesta_calificar_y_plazo` rechaza la respuesta de cualquier otro («Esta
  pregunta es para otro alumno.»). Probado: la alumna de la pregunta contesta,
  otro alumno no, ni en `question_answers` ni en `respuestas_en_curso`.
- **Los demás ven para quién es y no se les abre nada encima**: una línea
  «Tu profe le hizo una pregunta a … Piensa tu respuesta en silencio.» (el
  nombre viaja con el turno, en `game_state.elegido`; sin él dice «un
  compañero»). A la persona le sale la pregunta con «Esta pregunta es solo para
  ti», detrás del aviso grande de que la eligieron.
- **Lo que va jugando cada uno va a `respuestas_en_curso`, no a
  `question_answers`**: los informes, los trofeos, las insignias y el tiempo
  por sección cuentan las filas de `question_answers`, y una respuesta a medias
  no es una respuesta. Una fila por alumno y pregunta (la clave primaria), que
  el alumno solo escribe en una pregunta abierta de su profe que sea para todos
  o para él; la leen él, quien hizo la pregunta y administración, no los
  compañeros. Se manda en fila (`colaEnCurso`) para que una jugada vieja no
  llegue después de una nueva, y si falla no frena al alumno.
- **«Respuestas en el tablero»**, debajo del tablero del profe (como los de
  Practicar, y por eso también en modo sencillo, que esconde la pestaña
  Preguntar): un tablero por conectado, o solo el de la persona si es
  dirigida. Dice escrito en qué va: «Todavía no mueve», «Pensando… lleva 1 de
  2 jugadas: d4 d5» (cuenta las suyas, no las del motor) o «Respondió: e4 ·
  sin calificar», y con la respuesta mandada trae «✅ Correcta» / «❌ A
  revisar» ahí mismo, por el mismo `setAnswerCorrect` de la lista. La escucha
  de Realtime va filtrada por la pregunta (`question_id=eq.…`) y se cambia al
  cambiar de pregunta. Las de opciones no se contestan moviendo: no tienen
  tableros.
- **`resumen_de_la_clase` cuenta a cada uno sus preguntas**: las de toda la
  clase y las dirigidas a él. Una pregunta dirigida a otro no le suma una «sin
  responder».

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-dirigida
clase-preguntas clase-elegido`.** Está probado que falla de verdad: sin mandar
`para_alumno`, con la pregunta abierta para todos en la pantalla de los demás,
sin mandar las jugadas en curso, o mostrando todos los tableros en una
dirigida, salta.

### Tiempo para pensar

Una cuenta regresiva que ve toda la clase, sin abrir una pregunta: «2 minutos
para analizar la posición». Está en «El tablero — lo ve toda la clase» (a la
vista también en modo sencillo): cuánto tiempo, qué pensar (opcional, hasta 140
letras) y «⏳ Tiempo para pensar». Migración `game_state_tiempo_para_pensar`,
comprobada impersonando.

- **Va en `game_state.pensar`** (`{at, segundos, texto}`), por lo mismo que la
  vista y el elegido: quien recarga o entra tarde la ve igual. Un CHECK
  acepta solo esa forma, de 5 segundos a una hora.
- **Solo el profe lo pone** (`protect_game_state_teacher_columns`: al alumno
  con el control se le devuelve lo que había).
- **La hora de arranque la pone la base**: un `at` nuevo se cambia por
  `now()`, y la pantalla del profe usa el que devuelve el `update`. «+30
  segundos» manda el mismo `at` y se conserva: solo se alarga. Como en las
  preguntas con tiempo, cada pantalla cuenta contra su propio reloj, así que
  una computadora con la hora corrida lo ve corrido por lo mismo.
- **Lo que falta se calcula, no se guarda**
  (`PreguntaClase.estadoPensar`): se termina sola, dice «⏰ ¡Se acabó el
  tiempo!» ocho segundos más y después se va. «Terminar ya» lo deja en null.
- **Al profe, cuando se acaba, le ofrece «🎲 Elegir a alguien para
  responder»**: quita el aviso y sortea igual que el botón de Alumnos.
- **El aviso lo ven todos, también el profe**, que suele compartir su
  pantalla. El reloj cambia cada segundo y por eso NO es región viva: se dice
  en voz aparte (`#pensar-voz`) al empezar, a los 10 segundos y al terminar.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-pensar
clase-elegido`.** Está probado que falla de verdad: sin pintar qué pensar, con
«+30» mandando un arranque nuevo, sin decir que se acabó, sin irse solo, o sin
leer `pensar` de la fila, salta.

### La pregunta de salida

Al cerrar la clase, junto al título y la nota, el profe puede hacer una última
pregunta sobre lo visto: «🌡️ ¿lo entendiste?» o «❓ ¿qué jugarías?» en la
posición del tablero. Lo que contestan dice si el tema quedó o hay que
repetirlo, y se lo recuerda al profe cuando abre la clase siguiente, que es
cuando lo va a usar. Migraciones `pregunta_de_salida` y
`question_answers_el_alumno_solo_la_suya`, comprobadas impersonando.

- **Es una pregunta como cualquiera, marcada `questions.de_salida`**: los
  alumnos la contestan igual, el plazo y la calificación son los mismos. El
  termómetro sale por `hacer_pregunta_de_opciones` y se marca después con un
  `update` (lo permite `questions_update` a quien la hizo); la de jugada lleva
  `de_salida` en el insert.
- **La cuenta la hace la base**: `salida_de_la_clase(clase)`, SECURITY
  INVOKER, toma la ÚLTIMA de salida de esa clase y dice cuántos asistieron,
  cuántos contestaron y cómo les fue. Del termómetro (opciones sin calificar)
  cuenta la opción: la primera es «bien», la segunda «a medias», el resto
  «mal»; de una de jugada, la calificación. Probado: el profe ve todo, otro
  profe nada, una alumna solo lo suyo.
- **El veredicto lo dice la página** (`ResumenClase.veredictoSalida`, una sola
  copia): «más o menos» vale la mitad; con 70 % o más «✅ El tema quedó», con
  40 % o más «🤔 Quedó a medias: conviene un repaso corto», y si no «🔁
  Conviene repetir el tema la próxima clase». Siempre con los números escritos
  («2 de 8 alumnos contestaron: 1 lo entendió, 1 no lo entendió»). Lo que falta
  calificar no cuenta: se dice, y si falta todo, no adivina.
- **Se ve en tres lugares**: en el cierre (cambia con cada respuesta: la
  escucha de `question_answers` lo refresca aunque la pregunta vigente no se
  haya cargado), en «Qué hicieron» del registro del panel, arriba de la tabla,
  y al profe al entrar a la clase siguiente («📌 La clase pasada («…»), la
  pregunta de salida dijo: …»). Al alumno no se le muestra: su cuenta sería
  solo la suya.
- **De paso se cerró un agujero**: desde 20260914 cualquier alumno podía LEER
  las respuestas de sus compañeros a las preguntas de su profe, con el ✅/❌
  que la pantalla promete «en privado». La política de 20260914 copió a
  `question_answers` la condición de `questions` («creada por mi profesor») y
  la de 20260915 la pasó a `es_mi_profesor()`. Ahora el alumno ve solo la
  suya, como decía la original. El conteo sin nombres que ve la clase sale de
  `resultados_de_la_pregunta()`, SECURITY DEFINER, que no depende de esto; las
  funciones de informes (INVOKER) le dan a un alumno solo lo suyo.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-salida
panel`.** Está probado que falla de verdad: sin marcar la de jugada o el
termómetro, sin el recordatorio al entrar, con «más o menos» valiendo cero, sin
refrescar al llegar respuestas, o sin la línea del registro, salta.

### Mostrar la respuesta de un alumno a la clase

En «Respuestas en el tablero», cada respuesta ya mandada trae «📺 Mostrar a la
clase»: pasa al tablero de todos para comentarla. Sin migración.

- **Va como una variante que mira el profe** (`game_state.vista`), no como
  jugadas de la partida: la partida de la clase no se toca, y al volver al
  final todos la ven de nuevo, como cualquier variante. La vista nace en la
  jugada de la partida donde está la posición de la pregunta
  (`jugadaDeLaPosicion`: compara pieza, turno, enroques y al paso) y sigue con
  las jugadas del alumno.
- **Si esa posición ya no está en el tablero** (el profe mandó otra después
  de preguntar), lo dice y pregunta antes de reemplazar la partida («Mandar la
  posición y mostrarla»). Cancelar no toca nada.
- **De quién es, solo si el profe quiere**: la vista lleva `respuesta:
  {nombre}` (null = sin nombre). La casilla «decir de quién es» arranca sin
  marcar: mostrar una respuesta equivocada con nombre puede avergonzar. La
  clase lee «📺 Así lo resolvió Ana Rojas: 1. e4 e5 2. Nf3.» o «… un
  compañero …».
- El tablero no guarda ese dato, así que la página se queda con la vista que
  llegó (`vistaRecibida`) y se lo suma a la que se ve si es la misma
  (`vistaQueSeVe`). En cuanto el profe se mueve, la vista nueva ya no lo trae
  y el cartel cambia solo.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-mostrar
clase-vista`.** Está probado que falla de verdad: con el nombre siempre, con la
variante sin la parte de la partida, reemplazando la partida aunque se
cancele, o sin pasarle el autor a lo que ve el alumno, salta.

### Repasar lo que no quedó

Si la pregunta de salida de la clase pasada dijo «🔁 repetir» o «🤔 a
medias», el recordatorio del principio dice qué se vio del plan en esa clase
(«Se vio: «♟️ Regla del cuadrado».») y ofrece «🔁 Repasarlo en Mi plan»: abre
ese plan con esos renglones arriba y marcados, escrito («🔁 Para repasar: la
pregunta de salida de la clase pasada dijo que no quedó»). Si quedó, nada.

- **No se guarda nada**: sale de la pregunta de salida
  (`salida_de_la_clase`) y de lo que se marcó como dado en esa clase
  (`clase_plan_hecho`). Si no se marcó nada del plan, solo queda el veredicto.
- El orden es un `sort` estable: lo de repasar primero y el resto como estaba.
  Si ya había un plan abierto, se vuelve a pintar.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-salida
planes`.** Está probado que falla de verdad: sin subir lo de repasar, o
proponiéndolo aunque el tema haya quedado, salta.

### Notas rápidas desde donde se mira

La bitácora en la clase ya existía (el 📝 del renglón de cada alumno), pero
había que ir a la lista de alumnos, buscarlo y escribir todo. Ahora se anota
desde donde el profe está mirando, con lo que vio. Migración
`notas_en_clase_y_clase_para_ausentes`, comprobada impersonando.

- **«📝 Anotar en su bitácora»** en cada tablero de «Respuestas en el
  tablero», en cada tablero de Practicar y en la caja de quien tiene el
  turno. Abre la bitácora de ESE alumno (la misma, `NotasAlumno.montarPanel`,
  con `enClase`) con el cursor listo para escribir.
- **La posición va marcada cuando se abre desde su tablero** («Con la
  posición de su respuesta», «… de su partida»). Desde la lista de alumnos o
  la caja del elegido se ofrece la del tablero de la clase, sin marcar: ahí no
  se sabe si la posición tiene que ver.
- **Comienzos rápidos**: «Le costó», «Lo hizo muy bien», «Hay que repasar»,
  «Se distrajo». Un toque pone el comienzo; cambiar de comienzo no lo duplica.
- **Toda nota escrita en clase queda en la clase**
  (`notas_alumno.class_session_id`). El trigger `notas_alumno_clase_propia`
  rechaza colgarla de la clase de otro profe, también al editarla; un CHECK,
  una posición con forma rara.
- La nota guardada dice «🏫 En clase» y dibuja su posición. Ver «La nota
  lleva la clase y la posición» en seguimiento-del-alumno.md.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-notas
notas informes`.** Está probado que falla de verdad: sin mandar la posición o
la clase, duplicando el comienzo, marcando la posición también desde la lista,
o sin dibujarla, salta.

### La clase como lección para quien faltó

«Repasar mis clases» era solo de quien asistió. Ahora el profe decide al
cerrar si los que faltaron también la repasan, y el repaso trae las preguntas
que se hicieron en la clase, para pensarlas antes de ver la respuesta.

- **«📤 Que la repasen también los que faltaron»**, al cerrar, sin marcar:
  `class_sessions.para_ausentes`. La política `saved_games_select_ausentes`
  le da la partida de esa clase a los alumnos del profe
  (`interno.profesores_de`), y a nadie más. Sin marcarla, sigue como antes:
  solo quien asistió. En la lista, quien no fue lee «📤 Te la perdiste: tu
  profe la compartió» (su asistencia la lee de la base).
- **Las preguntas de la clase** (`questions.class_session_id`) salen debajo
  de las jugadas, en orden. La que se hizo en una posición de la partida lleva
  a esa jugada y, al llegar ahí, un aviso dice «❓ Acá tu profe preguntó: …
  Piénsalo antes de seguir». La que salió de Táctica o de un archivo se
  muestra en el tablero aparte. Lo que el alumno contestó en clase, si estuvo,
  va escrito con su nota.
- **La respuesta del motor, solo cuando la pide** («Ver la respuesta del
  motor»). La base se la da solo de preguntas YA CERRADAS
  (`question_engine_answers_select_alumno`): con la pregunta abierta sería la
  respuesta servida. Comprobado impersonando: con la pregunta abierta no la
  lee, cerrada sí, y un alumno de otro profe nunca.
- El doble de `lib/doble-entreno.js` ahora filtra `.in()` de verdad (antes lo
  ignoraba y devolvía todo).

**Al tocar esto, correr `node herramientas/verificar-todo.js repasar-clases
clase-salida`.** Está probado que falla de verdad: sin decir que se la
perdió, con la respuesta del motor a la vista, sin el aviso en la posición, o
sin mandar `para_ausentes` al cerrar, salta.

### El mapa de jugadas, el calentamiento y el podio

Tres cosas que ve toda la clase y que, por eso, van en `game_state` como la
vista, el elegido y el tiempo para pensar: quien recarga o entra tarde las ve
igual. Solo el profe las pone: `protect_game_state_teacher_columns` le devuelve
lo que había a cualquier otro (comprobado impersonando). Sus formas las revisan
CHECK envueltos en `coalesce(…, false)`: **un CHECK que da NULL cuenta como
aprobado**, y con una clave que falta (`{"lineas": []}` sin `question_id`)
`jsonb_typeof` da NULL. Pasaba también en `elegido` y `pensar`; la migración
`game_state_formas_sin_nulos` los arregló a los cinco.

- **El mapa de jugadas** (`game_state.encuesta`). «🗺️ Pasar el mapa de jugadas
  al tablero de la clase», en la pregunta activa (solo las de jugada): las
  cinco jugadas más elegidas van como flechas al tablero de todos, por orden
  de votos (verde, azul, naranja, rojo, negro), y debajo del tablero va
  **escrito** qué jugada es cada color y cuántos la eligieron: la flecha sola
  no dice cuál es cuál. Sin nombres; los números salen de
  `resultados_de_la_pregunta()`. Si el tablero ya no tiene la posición de la
  pregunta, se pregunta antes de mandarla (con `Avisos.confirmar`, como
  «Mostrar a la clase»). Se quita con «Quitar el mapa», al borrar las flechas
  o al mandar otra posición: una leyenda sin sus flechas mentiría.
- **La posición de calentamiento** (`game_state.calentamiento`). «🔥
  Calentamiento» en cada posición del plan y en cada ejercicio de Táctica.
  Cada alumno la juega en su propio tablero, sin que cuente como pregunta ni
  quede en ningún lado. La primera jugada se compara con la solución: la de
  Táctica (viene en SAN y se guarda en UCI, que no depende de cómo se escriba)
  o, en una posición del plan, la que calcula el motor en la computadora del
  profe al mandarla. Así el alumno no carga el motor. Puede intentarlo otra vez
  o ver la solución. **Quién lo resolvió va en la presencia** (el `at` del
  calentamiento, en `metaDePresencia()`), no en una tabla: es de ese rato. El
  profe ve «1 de 2 conectados ya lo resolvieron».
  En Modo Adaptado se contesta escribiendo (`ClaseAdaptada.montar`, la misma
  puerta que el clic).
  `metaDePresencia()` junta todo lo que anuncia cada uno: antes había tres
  `track()` con tres pedazos distintos, y **cada `track()` reemplaza el
  anterior entero**: levantar la mano borraba a quién miraba el profe.
- **Los puntos de la clase y el podio** (`js/puntos-clase.js`,
  `game_state.podio`). Los puntos salen de `resumen_de_la_clase` (lo contesta
  la base, con su RLS) con una regla que se lee escrita en la pantalla. No se
  guardan: se derivan de las filas de la clase. Se ven en «🏆 Puntos de esta
  clase» (en «Alumnos conectados»), con de dónde sale cada uno, y en el cierre. Los
  empatados comparten puesto: nadie queda segundo por el orden alfabético.
  «Mostrar el podio a la clase» manda una foto a `game_state.podio`, **con o
  sin nombres**: sin nombres, cada alumno se reconoce por su id y ve igual
  «Tú: 4.º lugar con 3 puntos», aunque no esté entre los tres primeros.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-encuesta`.**
Está probado que falla de verdad: con la leyenda sin el nombre del color, sin
quitar el mapa al borrar las flechas, dando por buena cualquier jugada del
calentamiento, guardando la solución en SAN, sin el cuadro para escribir, con el podio sin nombres que los
lleva igual o con el lugar del alumno tomado de otro, salta.

### La clase juega votando

«🗳️ La clase juega» (pestaña Preguntar): la clase juega una partida contra
el motor o contra el profe desde la posición del tablero.

- **Cada turno de la clase es una pregunta de jugada con tiempo**, la de
  siempre (`crearPregunta` con su `prompt` y su `tiempo_limite`), no un
  mecanismo aparte. Por eso cuenta para los puntos, se ve en «Respuestas en
  el tablero», el motor calcula su respuesta y entra en el repaso personal.
- Al cerrarse (se cierra sola unos segundos después del plazo, porque la base
  acepta votos hasta 5 s después; o con «Jugar ya la más votada») **se juega
  la más votada, por la misma puerta que el clic** (`board.jugar`): así se
  transmite, se registra y avisa a `onMove` como cualquier otra jugada.
  **Con empate se sortea entre las empatadas y se dice** («hubo empate entre
  Ac4, Cf3 y se sorteó»): elegir siempre la primera favorecería el orden
  alfabético.
- Si nadie votó, o el tablero cambió durante la votación, no se juega nada y
  se ofrece «Seguir la partida».
- **El motor contesta desde la computadora del profe** (`PracticeEngine`, con
  la fuerza elegida); contra el profe, la partida espera su jugada en el
  tablero, y con ella se abre la votación siguiente (`despuesDeJugarEnLaPartida`,
  enganchado a `onMove`).
- El estado vive en esa página (`sessionStorage`), no en la base: es del rato
  de la clase. Al recargar, la partida queda en pausa y se sigue con un botón,
  para que una recarga no abra una votación sola.

### El repaso personal

Al cerrar la clase, «📌 Mandarle a cada uno su repaso» manda UNA tarea
(`crear_tarea`) con un renglón `completar` que abre
`repasar-clases.html?repaso=<clase>`. Cada alumno ve ahí **solo las preguntas
de jugada que a él no le salieron**.

- **La regla está una sola vez**, en `js/repaso-clase.js`
  (`RepasoClase.pendientes`), y la usan las dos pantallas: el cierre decide a
  quién mandarle la tarea y el alumno ve las suyas. Con dos copias, a alguien
  le llegaría una tarea vacía.
- Entra lo que falló (`is_correct = false`, aunque la primera jugada fuera la
  del motor), lo que no contestó y lo que contestó distinto del motor sin que
  el profe lo calificara. No entran las de opciones (el termómetro no tiene
  respuesta correcta), las abiertas (la base no le da al alumno la respuesta
  del motor mientras siguen abiertas), las dirigidas a otro ni las que no
  tienen respuesta del motor. Van a lo sumo diez, en el orden de la clase:
  una partida votada entera daría treinta.
- Solo a los que vinieron (`class_attendance`) y a quien le quedó algo. A
  quien ya tiene el repaso de esa clase (un renglón con ese enlace) no se le
  manda otro.
- El alumno lo resuelve tocando o escribiendo (`js/cuadro-comandos.js`, con
  `js/tablero-accesible.js` para el teclado). Vale la jugada del motor o
  cualquier mate. «Ver la respuesta» la muestra jugada, pero no cuenta como
  resuelta.
- **Al resolverlas todas se marca solo el renglón de SU tarea**:
  `tarea_items.completada_at`, lo único que el alumno puede escribir de una
  tarea. Se marca la tarea que lo trajo (`?tarea=`, que agrega `tareas.html`
  a cada enlace).
- El doble de `lib/doble-entreno.js` aprendió `.is()` y un `update()` que
  anota y cambia las filas de verdad (antes no hacía nada), con el filtro
  apuntado en el resolver.

#### Lo que vio la respuesta vuelve a la semana

«Ver la respuesta» deja volver a intentarla y resolverla ahí mismo, recién
vista: eso no prueba nada. Ahora esa pregunta entra a una cola de repaso
espaciado y **vuelve a los 7 días**.

- **Es la cola de Entrenamiento**, no una nueva: `RepasoFallados` con la clave
  `clase_repaso_v1`, en `CLAVES` de `js/progreso-usuario.js` con
  `srsPorLinea`. Viaja con la cuenta (`training_state`): quien la vio en el
  celular la ve volver en la computadora. `repasar-clases.html` hace
  `ProgresoUsuario.init()` antes de contarla.
- **`RepasoFallados.volverEn(clave, id, días)`** la deja para dentro de esos
  días aunque se haya resuelto. Entra como «regular» (baja la facilidad) y
  la racha de limpios empieza de cero. Resolverla después en el mismo repaso
  de la clase, aunque sea limpia, **no la adelanta**: la tiene fresca.
- **La pregunta va guardada en la ficha** (posición, jugada del motor, texto
  del profe y de qué clase era): cuando vuelve, la clase ya pasó. La jugada ya
  la había visto, así que guardarla en su aparato no le cuenta nada nuevo. El
  texto del profe se pinta con `textContent`.
- **Cuando vuelve**, `repasar-clases.html?vuelven=1` («🔁 Lo que vuelve de tus
  clases») la muestra con el mismo tablero y las mismas reglas del repaso.
  Limpia, avanza en la cola; con un error antes de la buena, vuelve hoy mismo
  (como en Entrenamiento); si otra vez mira la respuesta, otra semana. Esta
  vista no marca ninguna tarea.
- **Se avisa** arriba de «Repasar mis clases» («🔁 Te vuelven N preguntas de
  tus clases») y en el hub de Entrenamiento, junto a las otras colas.

**Al tocar esto, correr `node herramientas/verificar-todo.js
clase-repaso-personal`.** Está probado que falla de verdad:
- sin anotarla al ver la respuesta, o para el día siguiente;
- adelantándola al resolverla limpia en el repaso de la clase;
- sin contar el error cuando vuelve;
- marcando una tarea desde lo que vuelve;
- sin el aviso, sin traer la cola de la cuenta, o sin la clave en
  `ProgresoUsuario`;
- sin el aviso del hub, o sin decir de qué clase viene.

### El modo proyector

«📽️ Proyector» (junto a Girar) abre otra ventana, `sesion.html?proyector=1`,
para la tele o el proyector del aula: el tablero grande y lo que ve toda la
clase (el tiempo para pensar, el mapa de jugadas, el calentamiento, el podio,
los equipos). Sirve en la clase presencial con una segunda pantalla: la clase
se da desde la ventana de siempre.

- **Lo que se ve va por lista blanca** (`.proyector-se-ve`, reglas en
  `css/styles.css`), no por lista negra: una herramienta nueva del profe no
  aparece proyectada sin que alguien lo decida.
- **El tablero del proyector no se mueve** (`interactive` y `allowArrows` en
  false) y **sigue lo que mira el profe** (`game_state.vista`), como un
  alumno. No calcula con el motor: ese trabajo ya lo hace la otra ventana.
- El tope de 420 px del tablero en las pantallas bajas (`@media (max-height:
  800px)`) es más específico que una regla simple: el proyector lo pisa con
  `#app` en el selector. En la tele el tablero es lo único que hay.

### Los equipos

«👥 Equipos» (en «Alumnos conectados»): el profe reparte a los conectados en dos a
cuatro equipos (`PuntosClase.repartir`: al azar y parejos, a lo sumo uno de
diferencia) y puede cambiar a cualquiera de equipo con un selector. Quien se
conecta después queda «sin equipo» hasta que el profe lo pone en uno.

- Van en `game_state.equipos` (migración `game_state_equipos`), protegidos
  por el mismo trigger que el podio y con su CHECK de forma envuelto en
  `coalesce`. Comprobado impersonando: la forma mala se rechaza y un alumno no
  los cambia.
- **Los puntos de un equipo no se guardan**: son la suma de los de sus
  integrantes (`PuntosClase.puntosDeEquipos`, sobre `resumen_de_la_clase`), y
  salen en el podio con su puesto (los empatados lo comparten).
- El nombre del equipo es su color escrito («Equipo Azul»): el color nunca va
  solo. Cada alumno ve el suyo marcado («tu equipo»), también en el podio.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-juega
clase-repaso-personal`.** Está probado que fallan de verdad:
- sin decir el empate, o sin cerrar la votación;
- sin seguir la partida después de que mueve el profe;
- con los nombres de los equipos por `innerHTML`, o con el podio sin los equipos;
- con el proyector que deja mover o que muestra la barra del profe;
- con la marcada mal fuera del repaso, o con cualquier jugada dada por buena;
- marcando la tarea que no era.

### sesion.js en partes

`js/sesion.js` pasaba de 7000 líneas. Lo que tiene vida propia se mudó, tal
cual, a su archivo:

- `js/clase-votacion.js`: la clase juega votando;
- `js/clase-mapa.js`: el mapa de jugadas;
- `js/clase-calentamiento.js`: el calentamiento;
- `js/clase-puntos.js`: los puntos, el podio y los equipos.

Se comprobó que el código movido es idéntico, línea por línea sin la sangría.

- **Son scripts clásicos cargados ANTES que `sesion.js`.** Las `let`/`const`
  de arriba de un script clásico son globales para toda la página, así que
  cada lado ve lo del otro. Usan lo de `sesion.js` (`board`, `sb`, `profile`,
  `setStatus`…) **solo dentro de funciones**, que corren cuando `sesion.js` ya
  cargó. Lo de arriba de estos archivos solo engancha botones.
- **Tienen que cargar antes, no después.** `init()` de `sesion.js` arranca
  apenas carga, y su primer `await` puede resolverse antes de que el
  navegador ejecute el script siguiente: un módulo cargado después podría no
  existir todavía cuando llega el primer estado del tablero.
- **La primera línea de cada uno es `/* El código de sesion.html.`**: es lo
  que usa `herramientas/lib/codigo-de-pagina.js` para juntar el código de la
  página. Sin esa línea, un verificador que busca algo del código de la clase
  dejaría de encontrarlo, y podría pasar sin comprobar nada.

### Treinta alumnos a la vez: la reconexión y los anuncios de la tanda

Revisión del 3/10/2026, antes de una clase con 30 alumnos (la más grande hasta
entonces había tenido 24, el 29/9). La base, en Pro con la máquina Small, venía
sin una sola medición lenta desde el cambio. Lo que pesa con 30 es Realtime:
el plan Pro deja **500 mensajes por segundo para todo el proyecto**, y un
mensaje es cada uno que **llega a** o **sale de** un navegador. Pasado el tope,
Realtime **desconecta** a la gente (`tenant_events`) y `supabase-js` reconecta
solo cuando baja. Dos cosas se arreglaron:

- **Volver a suscribirse no trae lo que se perdió.** Un canal que se cae (el
  celular se bloquea, el wifi parpadea, o el corte de arriba) se vuelve a
  suscribir solo, pero los cambios de ese rato no se reenvían: el alumno se
  quedaba con la posición vieja hasta la jugada siguiente del profe, y con la
  pregunta de antes. Ahora `alVolverASuscribir()` (en `js/sesion.js`) relee
  `game_state` y la pregunta en curso cada vez que el canal queda suscrito,
  **salvo la primera** (ya tiene su carga). Releer el tablero es seguro porque
  `applyGameStateRow()` ya trata el eco idéntico como eco: no anuncia dos
  veces. **El profe no relee su tablero** (el proyector y el control remoto
  sí): manda él, y una lectura que vuelve antes que la jugada que todavía
  viaja se la desharía un instante.
- **La tanda hacía anunciar a los 30 en el mismo segundo.** Al empezar el
  calentamiento o la competencia, al acabarse el tiempo y al quitarla el
  profe, cada alumno hacía `track()` en el acto, y cada anuncio le llega a
  todos los conectados: 30 × 31 ≈ 900 mensajes de golpe. Ahora
  `anunciarTanda()` (`js/clase-tanda.js`) espera un rato al azar (0,3-4 s) y
  manda lo último que haya: los anuncios se reparten y varios cambios seguidos
  salen en uno. Lo que cuesta: el profe ve la cuenta y el alumno su puesto en
  la competencia hasta 4 s tarde.

Lo que se miró y queda como está, anotado para la próxima vez:

- **Los otros `track()` de la clase** (mano levantada, calentamiento de una
  posición, a quién mira el profe) los dispara una persona cada vez: no caen
  todos juntos.
- **Cada respuesta a una pregunta** le hace al profe una lectura de las
  respuestas (`loadAnswersFor`): 30 pequeñas en unos segundos, que la base
  aguanta. Si llegan desordenadas, la lista puede quedarse con una vieja hasta
  la respuesta siguiente.
- **Una clase olvidada abierta** se come la de hoy: el índice
  `class_sessions_una_abierta_por_profesor` no deja abrir otra, y la página se
  cuelga de la vieja (ver «Cerrar la clase tiene que SIGNIFICAR cerrarla»). El
  3/10 había dos abiertas desde el 29/9. La franja lo dice («Clase abierta»
  con su hora): antes de empezar, si dice abierta y no la abriste hoy,
  cerrarla y abrir otra.

`verificar-clase-reconexion.js` corta la conexión de mentira (cambia la base
sin aviso y vuelve a llamar lo que la página hace al quedar suscrita) y mira
que la alumna vea la jugada y la pregunta, y que el profe no relea.
`verificar-clase-tanda.js` comprueba que el anuncio no sale en el acto. Los
dos fallan sin el arreglo.

### Lo de la clase se limpia al cerrar

El mapa, el calentamiento, el podio, los equipos, el tiempo para pensar y el
turno viven en `game_state`, que es el tablero del profe, no el de una clase.
Antes quedaban puestos, y la clase del día siguiente arrancaba con el podio y
los equipos de la anterior.

- Al cerrar, `limpiarLoDeLaClase()` los quita y termina la partida votada.
- Las flechas se van solo si eran las del mapa.
- La partida del tablero no se toca: es lo que se guarda y se repasa.

### Lo que aparece se dice en voz

Una caja que aparece no se anuncia sola: con lector de pantalla, nadie se
enteraba del podio, de su equipo, del calentamiento ni del mapa. Ahora
`anunciarALaClase(tipo, clave, texto)` lo dice en `#clase-voz` (una región
viva `sr-only`, como `#pensar-voz`).

- **Se dice una vez por cambio**, según una clave (el `at`, la pregunta, su
  equipo), y no con cada eco de Realtime.
- **Lo que llega junto se dice junto**, en un solo texto. Dos cambios
  seguidos de la misma región viva se pisan, y el lector dice solo el último.
- **Al profe no se le dice**: es él quien lo pone.
- `claseAcc.decir` no sirve para esto: su región vive dentro del recuadro del
  Modo Adaptado, que fuera del modo va con `display: none`, y una región
  oculta no habla.

### Los votos quedan en la partida, y «Jugar votando» desde el plan

- **Los votos de cada jugada votada quedan como comentario de esa jugada**
  (`game_state.comentarios`, el mismo de «📝 Comentar»). Por ejemplo: «Votos
  de la clase: e5 2, c5 1 (3 votos).». Así van con la partida de la clase
  al PGN y a «Repasar mis clases», sin guardar nada aparte.
- **Los votos se juntan por la jugada, no por cómo se escribió.**
  `resultados_de_la_pregunta` agrupa por el texto de la respuesta, así que
  «e7e5» y «e5» eran dos votos distintos: partía la cuenta y hasta inventaba
  un empate. Ahora cada respuesta se pasa por chess.js y se cuenta por su
  SAN; la que no es legal no cuenta.
- **«🗳️ Jugar votando»** en cada posición del plan la manda al tablero y
  empieza la partida desde ella. La clase juega con el color que mueve en esa
  posición.

### El control remoto

`sesion.html?control=1`, en el celular del profe con su misma cuenta.
«📱 Control remoto», junto a «Proyector», muestra la dirección para
escribirla o copiarla.

- **Qué hay en la pantalla:** el tablero chico, lo que ve la clase y botones
  grandes:
  - recorrer la partida;
  - 1 minuto para pensar;
  - elegir a alguien;
  - pasar el mapa de la pregunta;
  - mostrar el podio;
  - borrar las flechas.
- **Cada botón hace lo mismo que su botón de siempre**, y escribe en
  `game_state`: la clase y el proyector lo siguen. Lo que se esconde va por
  lista blanca, `.control-se-ve`, como el proyector.
- **Sigue lo que mira el profe en la computadora** (`game_state.vista`). Si
  no, «▶» avanzaría desde otra jugada.
- **La franja de estado no se ve en el celular:** `setStatus` escribe también
  en `#control-estado`, para que lo que pasó se lea ahí.
- **La partida votada no se maneja desde acá.** Vive en la ventana donde se
  empezó (ver «La clase juega votando»).

### Los puntos de la clase: dificultad, intentos y quién acierta primero

«Que todo en la clase tenga puntos y determine el mejor de la clase, que cada
puntaje sea proporcional a su dificultad, baje con varios intentos y premie a
los que lo hacen a la primera y de primero.» Antes cada respuesta correcta
valía 2 y cada contestada 1, fuera un mate en 1 o un mate en 3.

- **Por cada respuesta correcta** (migración `puntos_de_la_clase`):
  - **base según la dificultad**: de 10 (600 puntos Elo o menos) a 50 (2200 o
    más), en línea recta. Sin dificultad anotada (una posición armada a mano,
    un cuestionario), la de 1200: 25;
  - **intentos**: a la primera, todo; al 2.º, el 60 %; del 3.º en adelante,
    el 30 %;
  - **puesto**: el 1.º en acertar suma un 50 % más; el 2.º, un 30 %; el 3.º,
    un 15 %. El orden es el de la hora de la base de su última respuesta (la
    que acertó), no la de la computadora de nadie.
  - Lo incorrecto no suma, y contestar por contestar tampoco.
  - Lo demás, en la misma escala (una pregunta media son 25): turno de palabra
    bien 20, casi 10; práctica ganada al motor 30, tablas 15; partida ganada a
    un compañero 30, tablas 15.
- **La dificultad va en la pregunta** (`questions.dificultad`, de 400 a 3000,
  CHECK): el rating del ejercicio de Táctica, de la ronda rápida, de
  Habilidades (o el de su nivel) y de cada entrenamiento (Mates: el de su
  categoría; Precisión, Aperturas, Fichas: el de su nivel). `crearPregunta`
  la recibe en `extra.dificultad`; la de opciones la anota después en su fila
  (`hacer_pregunta_de_opciones` no la recibe).
- **Los intentos los cuenta la base** (`question_answers.intentos`): el
  trigger `respuesta_hora_de_la_base` pone 1 al contestar y suma uno cada vez
  que cambia la opción o las jugadas. Comprobado impersonando a un alumno:
  escribirse `intentos = 0` no cambia nada; cambiar la respuesta, sí suma.
- **El puesto necesita ver las respuestas de los demás**, y un alumno, por la
  RLS, solo ve las suyas. Por eso `interno.puestos_de_la_clase` es `SECURITY
  DEFINER` y devuelve solo los renglones que quien llama ya puede ver en
  `question_answers` (las mismas reglas que sus políticas de SELECT).
  Comprobado: el profe ve los 114 aciertos de sus 17 alumnos; un alumno, solo
  los suyos.
- **No se cambió `resumen_de_la_clase` ni `resumen_del_mes`**: cambiarles lo
  que devuelven obliga a borrarlas y crearlas de nuevo, y todo lo que ya las
  usa (el registro del panel, los informes) se habría enterado. Los puntos van
  en dos funciones nuevas, `puntos_de_la_clase` y `puntos_del_mes` (`SECURITY
  INVOKER`, con el mismo filtro de quién ve qué), y la página las junta por
  alumno (`PuntosClase.juntar`, `ResumenClase.cargarConPuntos`). El registro
  de clases del panel no las pide: no muestra puntos.
- **La cuenta está dos veces, a propósito y vigilada**: en la base
  (`interno.puntos_de_una_respuesta`) y en `PuntosClase.puntosDeUnaRespuesta`,
  que solo sirve para escribir la regla y para el doble de los verificadores.
  `verificar-clase-encuesta.js` comprueba los mismos seis casos que se
  probaron en la base (75, 39, 11, 10, 10, 50).
- **El calentamiento con nota y la competencia también suman**
  (`tanda_resultados`, migración `tanda_resultados`): cada ejercicio
  terminado deja un renglón, y cada uno bien vale lo de una respuesta a la
  primera con el nivel de la tanda; en la competencia, donde todos tienen los
  mismos, el 1.º, 2.º y 3.º en resolver cada ejercicio suman como en las
  preguntas (`puntos_de_tandas`, `puntos_de_tandas_del_mes`, con su
  `interno.puestos_de_tandas` igual que el de las preguntas). Ver «El
  calentamiento de 20 ejercicios».
- **Quien solo hizo el calentamiento también entra** en los puntos:
  `PuntosClase.juntar` lo agrega aunque no esté en el resumen.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-encuesta
clase-remoto`.**

### Los puntos del mes

`resumen_del_mes(p_profesor)` es una función `SECURITY INVOKER` de la base.
Suma `resumen_de_la_clase` de las clases del mes en curso, en hora de Costa
Rica.

- **Devuelve los conteos, no los puntos.** Los puntos de las preguntas los
  suma `puntos_del_mes` (ver «Los puntos de la clase: dificultad, intentos y
  quién acierta primero»); lo demás, con la regla de `js/puntos-clase.js`.
- **Quién ve qué.** Cada fila es de quien pregunta o de una clase suya:
  - el profe ve a sus alumnos;
  - el alumno ve solo lo suyo;
  - otro profe no ve nada.
- **La primera versión filtraba solo con la RLS, y no alcanzaba.** En una
  partida entre alumnos, la RLS le deja ver al alumno la fila del
  compañero, y otro profe veía algo de una clase ajena. Lo arregló
  `resumen_del_mes_solo_lo_propio`. Comprobado impersonando: el profe ve a
  sus diez alumnos; el alumno, su fila (también si pasa el id del profe); otro
  profe, ninguna.
- **Dónde se ven:**
  - el profe, en «📅 Ver los puntos del mes», dentro de «Puntos de esta
    clase»;
  - el alumno, en la tarjeta «Tus puntos de septiembre» de su panel
    (`clases.html`), que no aparece si este mes no tuvo clases.
- **No hay tabla de posiciones para los alumnos.** Mostrarles la de sus
  compañeros sería una lista que no pasa por una relación directa (ver «Las
  academias son privadas»).
- **El doble de `verificar-clase-registrada.js` aprendió `resumen_del_mes`**,
  y lo calcula de verdad: suma su propio `resumen_de_la_clase` por cada clase
  del mes, con el mismo filtro de quién ve qué.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-remoto
clase-juega`.** Está probado que fallan de verdad:
- sin limpiar al cerrar;
- avisando con cada eco, o avisándole al profe;
- sin anotar los votos, o contando «e7e5» y «e5» aparte;
- con «Jugar votando» sin el color que mueve;
- con el control remoto que no sigue al profe o que no muestra el estado;
- con el alumno pidiendo los puntos de otro.

### La clase en el celular del alumno

Muchos alumnos entran desde el celular, y ahí lo que se rompe no da ningún
error: la página funciona, pero el tablero queda abajo, la cuenta regresiva
no se ve mientras se mira el tablero, o un botón no se acierta con el dedo.
Medido en 375 × 740, con el mapa, el calentamiento, los equipos, el podio y
el tiempo para pensar puestos a la vez.

- **Lo de arriba va más junto en pantallas chicas** (`sm:` recupera lo de
  siempre): el título, «Contraseña/Salir» y la franja de estado. El tablero
  arrancaba a unos 300 px de arriba y ahora a 228: entra entero sin bajar.
- **El turno y el tiempo para pensar van pegados al tablero**, antes del
  mapa, el calentamiento, los equipos y el podio. Antes, en el celular, la
  cuenta regresiva quedaba debajo de todo eso, y quien miraba el tablero no
  la veía. En la computadora también queda mejor.
- **Los botones para el dedo miden 44 px de alto en el celular**: Girar,
  Coordenadas, Levantar la mano, y la ✕ que cierra la pregunta (medía 24).
  En la computadora quedan como estaban.
- Nada se sale a lo ancho, y la tarjeta de la pregunta muestra su tablero
  entero.

**Al tocar la pantalla de la clase, correr `node herramientas/verificar-todo.js
clase-movil`.** Está probado que falla de verdad: con el `sesion.html` de
antes saltan lo de arriba, el orden, la cuenta regresiva y los dos tamaños.

### La clase en el celular del profe

Para quien da la clase presencial caminando por el aula, con el celular
(además del control remoto, que es para manejar el proyector). Medido en
375 × 740, con todas las herramientas.

- **Sus herramientas van antes que el chat.** En una columna, el chat (que
  vive en la columna del tablero) quedaba antes que la barra del profe y las
  pestañas: Preguntar o Alumnos arrancaban a unos 2000 px del tablero.
  `acomodarChatDelProfe()` lo pasa después de la columna de herramientas
  mientras la pantalla es angosta (`max-width: 1023px`, donde las dos
  columnas se apilan), y lo devuelve a su lugar si se agranda (una tablet que
  se gira). Se mueve el nodo, así que sus eventos siguen igual. Solo para el
  profe: el orden del alumno ya estaba medido y no cambia.
- **Lo que se toca mide 44 px de alto en el celular**: ⏮ ◀ ▶ ⏭ (medían 32) y
  todo botón, selector o desplegable de la columna de herramientas, en cada
  pestaña (una regla en `css/styles.css`, `max-width: 639px`). En la
  computadora queda como estaba.
- **La ayuda de las flechas habla del dedo en una pantalla táctil**: con el
  dedo no hay clic derecho. El tablero ya dibujaba con un toque largo
  (`js/clases-board.js`); ahora la ayuda lo dice. Van los dos textos, y
  `.solo-tactil`/`.solo-raton` (`pointer: coarse`) eligen cuál se ve.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-movil`.**
Está probado que falla de verdad: sin mover el chat, o sin devolverlo; con ◀
chico; sin los 44 px de las herramientas o con ellos también en la
computadora; con la ayuda del clic derecho en el celular.

### Lo que más le costó a tu clase

En el panel del profe (`clases.html`), una tarjeta con las preguntas de jugada
de los últimos 30 días que más falló su clase, con su posición. Un botón arma
con ellas un plan de repaso. Así, lo que no quedó se repite en la clase
siguiente sin buscarlo a mano.

- **La cuenta la hace la base**: `preguntas_que_costaron(p_dias)`, `SECURITY
  INVOKER`, solo con las preguntas de quien pregunta.
  - Usa la misma regla de fallo que el repaso personal: marcada mal, o sin
    calificar y distinta de la primera jugada del motor.
  - Solo cuentan las preguntas ya cerradas y con al menos dos respuestas: con
    una sola, el porcentaje no dice nada del grupo.
  - Devuelve las diez que más costaron.
  - Comprobado impersonando: el profe ve sus diez preguntas y el alumno,
    ninguna.
- **El plan de repaso** es uno nuevo, «Repaso: lo que más costó (al …)», con
  un renglón de posición por pregunta, en el mismo orden, y el enunciado como
  su `pregunta` (js/plan-clase.js).
  - La tarjeta lleva a `planes.html?plan=<id>`, que ahora abre ese plan
    directamente.
  - En la clase, cada renglón trae sus botones de siempre: «Al tablero»,
    «Preguntar», «Jugar votando» y «Calentamiento».
- **Mirando a otra persona («Ver como») no se muestra**: la función contesta
  con las preguntas de quien entra, no de la persona que se mira.
- El diagrama es `NotasAlumno.diagrama`, que ahora se exporta: el mismo de
  las notas con posición, una sola copia.
- El doble de `verificar-panel.js` anotaba los insert y no devolvía nada: sin
  id, no se podía probar un plan con sus renglones. Ahora los anota en
  `window.__inserts` y devuelve la fila con su id, como PostgREST.

**Al tocar esto, correr `node herramientas/verificar-todo.js lo-que-costo
panel`.** Está probado que falla de verdad:
- sin el enunciado;
- con los renglones sin orden;
- con `planes.html` que no abre el plan;
- con la tarjeta vacía a la vista.

### La ronda rápida

«⚡ Ronda rápida con 5 de estos, al azar», en Táctica. Toma cinco ejercicios
del tema y la dificultad que se están mirando, sin repetir.

- **El tiempo por posición se elige al lado del botón**, en Táctica mismo. Se
  pensó ponerlo en la pestaña Preguntar, pero entonces el profe tenía que ir y
  volver entre pestañas para arrancar una ronda.
- **Los dos van debajo de la lista de ejercicios, no arriba.** Arriba corrían
  la galería de «Ver todas las posiciones» unos 80 px hacia abajo; en la
  pantalla del CI entraba un solo tablero y `verificar-sesion-curso.js` lo
  marcó.
- **Cada posición es una pregunta con tiempo**, la de siempre (`crearPregunta`
  con su `prompt` y su `tiempo_limite`), y el tablero de la clase la muestra.
  Se cierra sola un poco después del plazo (la base acepta hasta 5 s más), o
  con «Pasar a la siguiente».
- **Se califica sola** (`RondaRapida.esBuena`), porque la solución del
  ejercicio es conocida:
  - vale la jugada de la solución (también escrita «a1a8») o cualquier mate;
  - así cuenta para los puntos y los trofeos como si el profe la hubiera
    marcado.
- **Al terminar sale el resultado:** cuántas buenas tuvo cada uno, con el
  puesto compartido en el empate. «Mostrar el podio de la ronda» usa el mismo
  `game_state.podio` con un `titulo`, que la caja muestra en lugar de «Podio
  de la clase»; su CHECK de forma admite claves de más.
- No arranca si hay una partida votada en curso, y termina al cerrar la
  clase.

### El calentamiento de 20 ejercicios

«🔥 Calentamiento: 20 ejercicios de Táctica para cada alumno», en la pestaña
Preguntar (`js/clase-tanda.js`, `game_state.tanda_calentamiento`). Es para
que entren en calor antes de la clase. El profe elige el nivel (en puntos Elo,
de 600 a 2200) y el tiempo (de 5 a 30 minutos). Cada alumno resuelve los suyos
en su tablero, debajo del de la clase; si falla, ve cuál era y pasa al
siguiente. Al terminar los 20, o al acabarse el tiempo, ve su nota.

- **Lo que viaja es la receta, no los ejercicios**: `{at, semilla, elo,
  cantidad, segundos, alumnos}`. Cada alumno arma su tanda con la semilla y su
  id (`TandaCalentamiento.paraAlumno`, un azar con semilla: el mismo en todas
  las computadoras), y el profe rehace la de cualquiera para mirar el
  ejercicio en que está. Veinte posiciones por alumno en `game_state` serían
  varios KB de JSON en cada eco de Realtime.
- **Los ejercicios salen de `entreno/data/temas.json`**, los de Táctica de la
  clase: de Lichess, con su rating. Los que no tienen rating (los de
  `temas_extra.json`) quedan fuera: sin rating no hay nivel.
- **El mismo nivel para todos.** La banda son los ejercicios a ±100 del nivel
  (se abre de 50 en 50 hasta ±300 si no llega a 300). Se parte en 20 tramos
  seguidos y a cada alumno le toca uno de cada tramo: todos tienen el mismo
  reparto de dificultad, de más fácil a más difícil. La media de cada uno no
  se separa más de 30 puntos de la de otro (lo mide el verificador).
- **Distintos para cada uno.** Con un azar por alumno, en los niveles con pocos
  ejercicios (600, 2200) dos alumnos compartían 2 o 3. Por eso el profe manda
  en `alumnos` a los conectados, en orden, y al k-ésimo le toca el ejercicio k
  lugares después del punto de partida del tramo: mientras la clase no tenga
  más de 15 alumnos, no se repite ninguno. Quien entra después cae en un lugar
  al azar con su id, y a él sí le puede coincidir alguno.
- **Una sola respuesta buena.** Los ejercicios de Lichess tienen UNA jugada
  buena en cada paso; la excepción es el mate final, que a veces se da de más
  de una forma. Vale la jugada de la solución o cualquiera que dé mate
  (`TandaCalentamiento.revisar`), en UCI. Hay que jugar la línea entera: el
  rival contesta solo con la jugada de la solución. Un ejercicio cuya solución
  no se reproduce con chess.js, o que termina con una jugada del rival, no se
  usa.
- **Si falla, pasa.** El tablero vuelve a la posición de antes con la buena
  marcada y escrita («Era Ta4#»), y a los 2 segundos viene el siguiente.
  «No sé: pasar al siguiente» hace lo mismo. Ninguno de los dos suma.
- **La nota va de 0 a 100**: buenas sobre 20. Lo que no llegó a hacer cuenta
  como no resuelto; si no, terminar 3 de 3 daba 100.
- **El tiempo lo cuenta la base.** `at` lo pone el trigger con `now()` al
  mandar una tanda nueva (otra semilla), como el de `pensar`, y cada uno cuenta
  con `RelojServidor`: con la hora de cada computadora, una adelantada cortaba
  antes. «Terminar ya y dar las notas» acorta `segundos` hasta lo que pasó,
  con la misma semilla (el trigger no mueve `at`), y cada alumno ve su nota.
- **Lo que lleva cada uno va en la presencia** (`tanda` en
  `metaDePresencia()`: hechos, buenas, en cuál va), como el calentamiento de
  una posición: es de ese rato. El profe lo junta en `tandaVistos`, y quien se
  desconecta no se borra de la lista («(se desconectó)»). El alumno guarda en
  `localStorage` lo que hizo: al recargar sigue donde iba, y no puede volver a
  intentar el que falló.
- **Desde que suma puntos, cada ejercicio terminado queda en
  `tanda_resultados`.** La corrección la sigue haciendo la computadora del
  alumno: la base de ejercicios es pública, así que corregir en la base no
  impediría nada que no se pueda hacer mirando la solución. Lo que pone la
  base es lo que no se puede inventar: la hora, el plazo (el tiempo de la
  tanda más 15 segundos de gracia), el orden (el ejercicio k solo después del
  k − 1), uno por ejercicio (índice único), quién es, de qué profe y de qué
  clase, el modo y el nivel (de `game_state`, no de lo que manda el alumno).
  El alumno manda solo `{semilla, indice, bien}`, de a uno y en fila.
  Comprobado impersonando: saltarse uno, repetirlo, una semilla inventada,
  fuera de tiempo o un alumno de otro profe se rechazan; nadie lo cambia ni lo
  borra; otro alumno no lee nada.
- Solo el profe la pone (`protect_game_state_teacher_columns`, comprobado
  impersonando: el alumno no la puede quitar). El CHECK de forma va envuelto
  en `coalesce(…, false)`, y el trigger solo hace `jsonb_set` sobre un objeto:
  con `[]` daba un error de jsonb en vez de rechazarlo el CHECK.
- Se quita al cerrar la clase (`limpiarLoDeLaClase`). En Modo Adaptado se
  contesta escribiendo (`ClaseAdaptada.montar`), y la nota se dice en voz.

- **El profe cambia el tiempo mientras corre** («Quitar 1 minuto», «Sumar 1
  minuto» y «Que queden N minutos», debajo de la lista). El tiempo al mandarlo
  se escribe (de 1 a 60 minutos), ya no se elige de una lista fija. Lo que
  cambia es `segundos`, con la misma semilla: la base no mueve `at` (lo mismo
  que «Terminar ya»), así que no hizo falta tocar el trigger. «Que queden 3»
  es lo que ya pasó más 3 minutos; restar no corta antes de ahora, y con el
  tiempo acabado solo se ofrece «Dar 1 minuto más», que cuenta desde ahora
  (`TandaCalentamiento.segundosSumando`, pura y probada). Nunca más de 2 horas
  en total (el CHECK ya decía 7200).
- **Si el profe da más tiempo cuando ya se acabó, cada alumno sigue donde
  iba.** El alumno guarda si terminó por el tiempo (`porTiempo`, también en
  `localStorage`) o porque hizo todos: solo en el primer caso se vuelve a abrir
  (`reabrirTandaSiHayTiempo`), en el ejercicio en que iba y sin repetir lo
  hecho. Sin eso, alargar el plazo no servía de nada a quien ya había visto
  «Se acabó el tiempo». Al alumno se le dice en voz «Tu profe cambió el
  tiempo: quedan…».

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-tanda`.**
Está probado que falla de verdad: con un azar por alumno en vez del lugar en la
lista (se repiten), sin aceptar otro mate, sin que el alumno siga al dar más
tiempo, o con los empatados en puestos distintos, salta.

### La competencia de ejercicios

El otro modo del mismo calentamiento («Modo: Competencia», `modo: "reto"` en
`game_state.tanda_calentamiento`): el profe pone el nivel y el tiempo, **todos
reciben los mismos ejercicios en el mismo orden**, y gana quien resuelva más
antes de que se acabe. Es el mismo código de la tanda (`js/clase-tanda.js`):
el tablero, «si falla, pasa», el reloj de la base, la presencia y el cambio de
tiempo son los de arriba.

- **Los mismos para todos** (`TandaCalentamiento.paraTodos`): la banda del
  nivel se baraja con la semilla —por eso salen variados, de temas distintos:
  el verificador pide 5 temas o más entre los primeros 20— y se toman 100,
  ordenados de más fácil a más difícil, como una carrera de ejercicios. No
  depende del alumno: no hace falta la lista de conectados (`alumnos: []`).
  100 son más de los que alguien alcanza en 30 minutos (18 segundos cada uno);
  quien los hace todos termina antes («¡Hiciste todos los ejercicios!»).
- **Una sola respuesta buena**, como en el calentamiento con nota: los de
  Lichess tienen una jugada buena en cada paso; vale también otro mate.
- **Gana quien resuelva más; los empatados comparten puesto**
  (`TandaCalentamiento.puestos`, la regla del podio): nadie queda segundo por el
  orden alfabético. No hay nota: lo que cuenta son los resueltos.
- **El profe ve la tabla en vivo**, siempre ordenada por resueltos, con el
  puesto delante del nombre. **Cada alumno ve en qué puesto va** («vas 2.º de
  8») y, al final, en cuál quedó: lo arma con lo que anuncian los demás en la
  presencia (el canal de la clase, que ya ve cada alumno). Cuenta solo a los
  conectados; la tabla del profe guarda también a quien se desconectó.
- **No se guarda en ninguna tabla**, por lo mismo que el calentamiento con
  nota: lo corrige la computadora de cada alumno.
- La migración `game_state_tanda_competencia` subió el tope de `cantidad` a
  200 (era 40) y admite `modo` ("nota" o "reto"); el CHECK sigue envuelto en
  `coalesce(…, false)`. Comprobado contra la base: un `modo` inventado, `modo:
  null` o 300 ejercicios se rechazan.

### El cuestionario al estilo Kahoot

«🎯 Cuestionario al estilo Kahoot», en la pestaña Preguntar
(`js/clase-cuestionario.js`). El profe arma una lista de preguntas con
opciones (de 2 a 4, con su correcta y su tiempo), la guarda y la juega con
cualquier clase. La ronda rápida ya encadenaba posiciones de Táctica; esto es
lo mismo con preguntas propias, de ajedrez o no, y con puntos por rapidez.

- **Se guarda en `cuestionarios`** (migración `cuestionarios`), una fila por
  cuestionario con sus preguntas en `jsonb`. Es solo del profe que lo
  escribió: la correcta de cada pregunta vive ahí, así que ni sus alumnos ni
  otro profe leen la tabla (comprobado impersonando: el alumno ve 0 filas y
  no puede firmar uno con el id del profe). Lo que se guarda son las
  preguntas limpias (`Cuestionario.limpiar`): sin opciones vacías y con la
  correcta renumerada, igual que «una pregunta con tus opciones».
- **Cada pregunta es una de opciones de las de siempre**
  (`hacer_pregunta_de_opciones`): la correcta va a `preguntas_clave`, la base
  califica sola y cobra el plazo, y cuenta para los puntos de la clase y los
  trofeos. No hay otra forma de preguntar ni otra forma de calificar.
- **Sin posición, sin tablero.** Una pregunta que no habla de una posición
  («¿qué pieza salta?») no le muestra al alumno un tablero que no viene al
  caso: `questions.sin_tablero`, que pone la versión de seis argumentos de
  `hacer_pregunta_de_opciones`. La de cinco quedó como un pasamanos a la
  nueva, **sin valor por omisión** en el sexto: con uno, la llamada de cinco
  sería ambigua entre las dos. La que sí lleva posición la toma del tablero de
  la clase al armarla («📌 Usar la posición del tablero de ahora»), y al
  jugarla se manda con `aplicarPosicionEnClase`: ninguna posición se inventa.
- **Los puntos: de 500 a 1000 por acertar, más cuanto antes; 0 al fallar**
  (`Cuestionario.puntos`, la regla escrita en `REGLA` y a la vista del profe).
  Se calculan con las horas que pone **la base**: la de la pregunta y la de la
  última respuesta. `created_at`/`updated_at` de `question_answers` los podía
  mandar el alumno desde la consola (un `created_at` igual al de la pregunta
  eran 1000 puntos siempre); el trigger `respuesta_hora_de_la_base` los pisa
  con `now()`. Cuenta la **última** respuesta: contestar rápido cualquier cosa
  y cambiarla después no da puntos de rapidez. Calificar a mano no mueve la
  hora. No se guardan: se derivan de las respuestas.
- **El plazo se cuenta con el reloj de la computadora del profe**, desde que
  llegó la pregunta, más 6 s de la gracia de la base. El de la base puede
  estar corrido unos segundos respecto al del profe.
- **«Ya contestaron: cerrar esta pregunta» acorta el plazo EN LA BASE**
  (`tiempo_limite`, nunca menos de 10 s, que es lo que admite). Cerrarla
  (`closed_at`) no servía: la tarjeta del alumno desaparece al cerrarse, y con
  ella lo que contestó el grupo. Y mostrar la correcta con el plazo abierto
  dejaría cambiar la respuesta.
- **Al terminar cada pregunta** la clase ve qué contestó el grupo, con la
  correcta marcada (`resultados_visibles`), y el podio de cómo va, con su
  título, en el mismo `game_state.podio` de la clase y la ronda (con o sin
  nombres, según «Con nombres» de Puntos de esta clase). Al lanzar la
  siguiente, el podio se quita. El último es «Podio final de…». El profe ve
  además los cinco primeros con lo que sumó cada uno en esa pregunta.
- No arranca con una ronda rápida o una partida votada en curso (ni la ronda
  con un cuestionario), y termina al cerrar la clase. Terminarlo a mitad de una
  pregunta no la suma: no se llegó a ver cuál era.

**Al tocar esto, correr `node herramientas/verificar-todo.js
clase-cuestionario`.** Está probado que falla de verdad: contando la hora de
la primera respuesta en vez de la última, sin mandar `p_sin_tablero` o con el
tablero a la vista en una pregunta sin posición, salta.

#### Los cuestionarios listos y `cuestionarios.html`

El profe arma sus cuestionarios también **fuera de la clase**, en
`cuestionarios.html` (en su panel, «Tus clases»), y tiene **30 listos de la
Academia**: diez por nivel —inicial, intermedio y avanzado—, de 16 a 19
preguntas cada uno, 485 en total. Migración `cuestionarios_listos_y_nivel`,
comprobada impersonando roles.

- **Un solo armador para las dos pantallas** (`js/cuestionario-editor.js`):
  la parte pura (`Cuestionario`), el armador y sus botones (`montarArmador`).
  La clase (`js/clase-cuestionario.js`) y la página (`js/cuestionarios.js`)
  tienen los mismos id y cada una pone en `CQ` lo suyo: de dónde sale la
  posición (en la clase, el tablero; afuera, un FEN pegado, que pasa por la
  misma `PosicionValida` de la clase en vivo), cómo se avisa y qué más se
  hace con uno listo (jugarlo en la clase, o ir a jugarlo).
- **`nivel`** (inicial, intermedio, avanzado o ninguno) y **`listo`** en
  `cuestionarios`. Uno listo no tiene dueño (`profesor_id` nulo; un CHECK lo
  ata a `listo`). Lo leen quienes dan clase y quien administra; **los alumnos
  no**, porque trae las respuestas. Nadie lo cambia ni lo borra desde la
  página: las políticas de escritura siguen siendo solo de lo propio.
  Comprobado: el profe ve los 30, su `update` y su `delete` sobre ellos no
  tocan ninguna fila y no puede crear uno «listo»; el alumno no ve ninguno.
- **También se manda como tarea**, para contestarlo en la casa: «📨
  Mandarlo como tarea», en uno listo y en uno propio ya guardado. Ver «El
  cuestionario como tarea» en `seguimiento-del-alumno.md`.
- **Uno listo se juega tal cual o se copia.** «📋 Copiarlo a mis
  cuestionarios» crea uno propio, con el mismo nivel y las mismas preguntas,
  que ya se puede cambiar. En la clase, «▶️ Jugarlo con la clase» lo juega
  sin copiarlo. Desde la página, cada uno lleva a
  `sesion.html?cuestionario=<id>`, que abre la caja con ese elegido: empezar
  lo decide el profe, con la clase ya conectada.
- **El nivel se guarda al elegirlo**, no al guardar: el armador se vuelve a
  pintar al poner una posición o mover una pregunta, y lo pintaba con el de
  antes (lo encontró `verificar-cuestionarios-pagina.js`).
- **La fuente es `herramientas/cuestionarios-listos.js`**, con cada pregunta
  escrita **con la correcta primero** para revisarla de un vistazo; el script
  reparte su lugar entre A, B, C y D (con un hash del texto: sembrar dos
  veces da lo mismo) y escribe `herramientas/cuestionarios/semilla.sql` (no
  se commitea), que borra los listos y los vuelve a sembrar. Un nivel por
  sentencia, con cada pregunta como `[texto, opciones, correcta, tiempo]`:
  la base arma el objeto y el SQL pesa un cuarto menos. Lo sembrado se
  comparó con el script con un md5 por cuestionario: los 30 idénticos.
- **Ninguna pregunta trae posición**: ninguna se inventa. Las aperturas se
  nombran por sus jugadas, y el verificador las juega todas con chess.js
  desde la posición inicial; las dos que afirman algo del tablero (qué ataca
  6.Cxf7 en el Fegatello, que 3...Ab4 clava el caballo de c3) se comprueban
  en el tablero. El Fegatello decía «¿qué ataca?» y el caballo también ataca
  el peón de e5: ahora pregunta por las dos **piezas**.
- **Los distractores tientan y fallan por algo**: nombres de aperturas
  vecinas, campeones de la misma época, reglas parecidas. Nada que se
  descarte sin saber ajedrez.

**Al tocar el banco, correr `node herramientas/verificar-cuestionarios-listos.js`**
(sin navegador): que sean 30, diez por nivel y de 15 preguntas o más; que cada
uno pase el armador tal cual, sin que se recorte nada; que ninguna opción ni
pregunta se repita; que la correcta caiga en cada letra entre el 18 % y el
32 % de las veces; que las jugadas sean legales, y que el SQL no se rompa.
Después, volver a sembrar. **Al tocar la página, `verificar-cuestionarios-pagina`**,
y la clase sigue en `clase-cuestionario`. Está probado que fallan de verdad:
con una jugada ilegal, con la correcta siempre en la A, sin el filtro de
nivel, perdiendo el nivel al poner la posición o copiando el listo antes de
jugarlo, saltan.

### La participación pareja

Arriba de las pestañas del profe, y solo para él (nunca lo ve la clase):
«🙋 Llevan un rato sin contestar», con quién no contestó 3 o más de las
últimas 4 preguntas (`Callados.calcular`).

- **Qué preguntas cuentan:**
  - solo las de todos (una dirigida a otro no cuenta);
  - solo las que se hicieron mientras el alumno estaba: a quien acaba de
    entrar no se le cuenta lo de antes. Desde cuándo está lo anota la página
    del profe al verlo llegar; el `online_at` de la presencia no sirve, porque
    cambia con cada anuncio.
- **«🎯 Darle el turno»** usa el turno de siempre (`darTurno`), con un origen
  nuevo, `'profe'` (migración `clase_elegidos_origen_profe`). Sin él, ese
  turno habría quedado en el registro como un sorteo que no fue. Al alumno se
  le dice «Tu profe te eligió», sin mencionar que no contestaba.
- Se vuelve a contar cuando cambia la presencia o una pregunta, juntando las
  llamadas seguidas en una sola consulta.

### Lo que le costó a cada alumno

En su informe (`informes.html?alumno=`), «🧩 Lo que le costó a Ana»: las
preguntas de clase de los últimos 30 días que contestó mal, qué jugó y cuál
era la buena (en notación española), con su posición y cuántas falló de
cuántas contestó. «Armar un plan de repaso para Ana» usa el mismo armado que
la tarjeta de la clase (`LoQueCosto.armarPlan`), y cada renglón dice qué jugó.

- **La base:** `preguntas_que_le_costaron(p_alumno, p_dias)`, `SECURITY
  INVOKER`, con la misma regla de fallo que el repaso personal. Comprobado
  impersonando:
  - su profe ve sus preguntas falladas;
  - un compañero y otro profe no ven ninguna;
  - el propio alumno tampoco, porque su RLS no le da las preguntas de las
    clases cerradas por esa vía. Por eso la sección es solo del informe que
    mira el profe.
- **Mirando a otra persona («Ver como») se ve**, pero no se ofrece armar el
  plan: quedaría a nombre de quien mira.

### «Ver como alumno»

«👁️ Como alumno», junto a «Proyector», abre `sesion.html?como=alumno`. Es la
clase del profe tal como la ve un alumno (la pregunta, el calentamiento, el
podio con «Tú: …», los equipos…), para revisar antes de mostrar algo, sin
otra cuenta. Una barra arriba lo dice siempre y da la salida.

- **Nada se manda desde ahí**, y se corta en el cliente de Supabase mismo, no
  en cada botón. En esa ventana:
  - `insert`, `upsert`, `update` y `delete` no hacen nada;
  - de las funciones de la base, solo corren las de lectura
    (`RPC_DE_LECTURA`).
  - Así, contestar una pregunta no deja respuesta, ni la «en curso».
- **La asistencia y el tiempo en clase (`class_presence_log`) ni se
  intentan.** Al principio se intentaban y, como la escritura devolvía vacío,
  la página se caía antes de mostrarse: lo encontró la prueba.
- **La presencia entra con otra clave y con el rol `vista-previa`**:
  - no cuenta como alumno: ni asistencia, ni turno, ni aviso de quién no
    contesta;
  - con la misma clave, su anuncio se habría mezclado con el de la ventana del
    profe.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-ronda
lo-que-costo`.** Está probado que fallan de verdad:
- **ronda rápida:**
  - sin aceptar un mate que no es el guardado, o sin calificar;
  - con el podio sin título;
- **aviso de quién no contesta:**
  - contándole lo de antes a quien entró tarde;
  - contando las dirigidas a otro;
  - dando el turno como un sorteo;
- **«Ver como alumno»:**
  - con la vista de alumno que manda algo;
  - o que entra a la presencia como alumno;
- **lo que le costó a un alumno:**
  - con el plan ofrecido mirando a otra persona;
  - con las jugadas en inglés.

### Entrar desde el celular con un código QR

En la clase presencial, «📱 Código para entrar», en la barra del proyector
(`sesion.html?proyector=1`), muestra arriba del tablero un código QR grande.
Al lado van la dirección escrita y cuántos alumnos ya entraron. El código
abre `sesion.html?profe=<id del profe>` en el celular; el alumno entra con su
cuenta de siempre y contesta ahí.

- **`?profe=` elige la clase, no da permiso.** `ClaseElegida.resolver` lo usa
  solo si ese profe está en `mis_clases()` del alumno, y la deja recordada. Si
  el id no es de sus profes, no hace nada; y lo que se ve lo decide igual la
  RLS. Lo del id en el código no es un dato que abra nada: sin la relación,
  la base no entrega su clase.
- **El parámetro se quita de la dirección** (`history.replaceState`). Si no,
  al cambiar de clase con el selector (que recarga) volvería a mandar él.
- **Quien no tenía sesión en ese celular pierde el `?profe=`.** La guardia de
  sesión manda a `login.html?next=` solo con la ruta, y `next` no acepta
  parámetros a propósito (una redirección abierta). No se tocó: después del
  login cae en `sesion.html`, y en un celular nuevo no hay clase recordada, así
  que entra a la que está abierta. Solo quedaría mal un alumno con dos profes
  con clase abierta a la vez, en un celular donde nunca entró.
- **El código va negro sobre blanco también en modo oscuro**, con su fondo
  y su margen de 4 módulos dentro del dibujo, no puestos por la caja. Invertido
  o sin margen, muchas cámaras no lo encuentran. La dirección escrita va sin el
  id: quien la teclea entra igual a la clase abierta.
- **La librería es `qrcode-generator`** (MIT, sin dependencias), en
  `js/vendor/qrcode.js` como las demás (ver `herramientas/lib/librerias-vendor.js`).
  `js/clase-qr.js` la pide recién al mostrar el código: solo la usa el
  proyector.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-qr`.** Lee
el código de una captura de la pantalla con `jsqr` (solo de desarrollo), en
modo claro y oscuro. Está probado que falla de verdad:
- con la dirección sin el profe;
- sin el margen o sin el fondo blanco del dibujo, o con la caja oscura;
- sin quitar el parámetro, o aceptando el id de cualquiera;
- sin contar a quien entra;
- cargando la librería siempre;
- con el botón sin `aria-expanded`.

### La clase vista por invitados sin cuenta

Para que alguien conozca la clase antes de tener usuario, el profe comparte un
enlace desde «👥 Alumnos conectados» → «🔗 Que vean la clase sin cuenta» (un desplegable
cerrado; antes vivía en la pestaña «➕ Invitar», que se quitó)
(`js/clase-invitados.js`). Quien lo abre (`ver-clase.html#t=<token>`) escribe
su nombre, acepta la privacidad y ve el tablero en pantalla completa,
siguiendo lo que mira el profe, **sin poder tocar nada**. La idea es que quiera
su cuenta: al terminar, la pantalla le ofrece la prueba gratis y los planes.

- **Lo que ve lo decide la base, no la pantalla.** El invitado no tiene
  `auth.uid()`: no puede leer `game_state` ni por la RLS ni por Realtime. Todo
  pasa por funciones `SECURITY DEFINER` que reciben el token del enlace y el
  secreto del invitado (se guarda solo su sha256), y **cada vez** vuelven a
  mirar que el enlace siga vigente, que la clase esté abierta
  (`clase_abierta_de`) y que el invitado no esté bloqueado:
  `clase_invitado_info` (de quién es la clase), `clase_invitado_entrar`,
  `clase_invitado_ver` y `clase_invitado_salio`. Las del profe
  (`clase_enlace_obtener`, `clase_enlace_apagar`, `clase_enlace_sacar`) solo
  con sesión, y la primera solo para `role = 'profesor'`: quien administra no
  da clase.
- **Solo sale el tablero**: la posición, las jugadas, la vista del profe, sus
  flechas y círculos, y si ocultó las piezas. Nada del chat ni de los alumnos,
  y de `vista` se quita `respuesta` (el nombre del alumno cuya respuesta se
  muestra): las academias son privadas.
- **Pregunta cada 2 s en vez de escuchar Realtime.** Sin sesión no hay RLS que
  lo deje escuchar, y un canal de broadcast lo seguiría escuchando un
  bloqueado desde la consola. Una llamada que vuelve a mirar el permiso cada
  vez es lo que hace cumplir el bloqueo.
- **Salirse de la pantalla, como en el examen**: `visibilitychange`, `blur` y
  salir de pantalla completa. La salida se anota **en el momento**, no al
  volver: así al profe le llega aunque el invitado cierre la pestaña. La
  primera vez, al volver, `Avisos.alerta` le dice que el profe ya lo sabe y que
  si vuelve a salir ya no va a ver el tablero; mientras la lee, el tablero no
  se ve. La segunda, la base lo bloquea (`bloqueado_at`) y
  `clase_invitado_ver` ya no le da el tablero. El `blur` y el
  `visibilitychange` de la misma salida cuentan una vez (en la página y en la
  base, con 3 s de margen). Recargar la página puede contar como salirse: la pestaña se oculta al descargarse.
- **Al profe le llega por Realtime** (`clase_espectadores`, filtrado por
  `owner_id`): quién entró, la primera salida («se le advirtió») y la segunda
  («ya no puede ver el tablero»), con la lista escrita al lado de cada nombre.
  `visto_at` cambia cada 20 s mientras mira (para decir «mirando» o «se fue»)
  y eso NO es un aviso: el aviso sale solo si subieron las `salidas`.
- **Volver a entrar con otro nombre no alcanza**: la IP de cada invitado queda
  en `interno.clase_espectadores_ip` (no la ve nadie, ni el profe) y un
  bloqueado cierra la entrada a esa IP en ese enlace. En la misma computadora
  lo recuerda además el navegador. Desde otra conexión sí se puede: sin cuenta
  no hay forma segura de saber quién es, y para eso está el profe, que ve la
  lista y puede **sacar** a cualquiera.
- **El freno**: entrar crea una fila sin cuenta, así que pasa por
  `interno.frenar_envio_publico('invitado', …)` (30 por IP y 150 por enlace en
  una hora), y hay un cupo de 40 mirando a la vez por enlace.
- **Un solo enlace vigente por profe** (índice único parcial). «Cambiar el
  enlace» y «Apagar el enlace» sacan a todos los invitados y borran sus filas.
  Además, `limpiar-invitados-de-clase` (pg_cron, diario) borra los de hace más
  de dos días, que es lo que promete la política de privacidad.
- **El token va en el `#`, no en `?`**: no viaja al servidor ni queda en
  registros ni en el Referer.
- **En la pantalla de la clase no hay ningún enlace, ni el pie**: tocarlo
  sería salirse. La pantalla completa se pide dentro del clic de «Entrar»
  (después de esperar a la base el navegador ya no la deja); en el iPhone no
  existe y la clase se ve igual, ocupando la ventana. Los primeros 1,5 s
  después de entrar no cuentan como salida: entrar a pantalla completa mueve
  el foco.
- El formulario lleva su casilla de privacidad y manda la versión aceptada;
  la política dice qué se guarda de un invitado.

#### El invitado que no ve la pantalla

La página del invitado se sigue igual que la clase con lector de pantalla, y
además con la voz del navegador para quien no tiene lector:

- **Los dos botones van en la página misma** («🦯 Modo adaptado» con
  `aria-pressed`, y «Activar voz» de `BlindNotation.setupSpeechToggle`, con
  su nombre fijo «solo si no usas lector de pantalla»), en la entrada y en la
  barra de la clase: esta página no tiene el encabezado del sitio, que es
  donde vive el interruptor de siempre. Tocar uno repinta su gemelo.
- **El recuadro es el de la clase** (`ClaseAdaptada.montar` en `#vc-cmd`):
  «posición», «caballos», «qué hay en e4», «ir a e4». Una jugada escrita dice
  que solo se mira y que para jugar hace falta la cuenta, y no cambia nada.
- **Todos los avisos van a UNA región viva, `#vc-voz`**, fuera del recuadro
  (que con el modo apagado va con `display: none` y no habla), y la voz dice
  lo mismo (`anunciar()`): la bienvenida, si la clase está abierta o cuándo
  abre, cada jugada, lo que muestra el profe (`ClaseAdaptada.describirVista`,
  la misma frase que oye un alumno), las piezas ocultas, **las flechas y
  círculos nuevos del profe** («Tu profe marcó una flecha de bella 1 a cesar
  3»), la advertencia al salirse y la pantalla final. Para eso `ClaseAdaptada`
  aceptó `cfg.anunciar`: sin él, sus avisos seguían yendo a su propia región y
  se oían dos veces o ninguna.
- **Lo que llega junto se dice junto**: `anunciar()` junta lo de 80 ms en un
  solo texto. Dos cambios seguidos de la misma región se pisan, y la voz
  (`speechSynthesis.cancel()`) cortaba el primero a la mitad. Por lo mismo la
  bienvenida espera al primer estado del tablero y sale con él.
- `#vc-estado` quedó escrito pero mudo: si hablara, cada aviso se oiría dos
  veces.
- **El foco**: al entrar, al recuadro (con el modo) o al título de la clase;
  al quedar fuera, al título de la pantalla final, porque el tablero donde
  estaba se fue. La voz dice también ese título, que el lector lee solo.
- **En Modo Adaptado, salir de pantalla completa no cuenta como salirse.** Con
  lector de pantalla la tecla Esc es de todos los días (NVDA la usa para salir
  del modo foco) y sacaría de la clase a quien no hizo nada. Irse a otra
  pestaña u otra aplicación cuenta igual. La entrada lo dice.
- La voz no lee los emojis (`ClaseAdaptada.hablar` los quita): diría
  «warning sign».
- **Con la voz del encabezado** (`js/voz-pagina.js`, que lee las regiones
  vivas de toda página con encabezado): esta página no tiene encabezado, así
  que no la carga y dice sus avisos con `anunciar()`. En `sesion.html` sí está,
  y lee la región del recuadro, así que lo que `ClaseAdaptada` además dice
  directo se oiría dos veces; no pasa porque `BlindNotation.speak` descarta el
  mismo texto repetido en 2 s. `verificar-clase-voz.js` comprueba que la
  respuesta del recuadro se oiga una sola vez (falla sin ese descarte).
- `numerarJugadas` y `describirVista` se mudaron de `sesion.js` a
  `js/clase-adaptada.js`, sin cambiar lo que dicen: las usan las dos páginas.

#### El profe le enciende el modo adaptado

Una persona ciega que entra con el enlace no siempre encuentra el botón del
Modo Adaptado. Ahora lo puede encender el profe, de dos maneras:

- **El enlace ya abre en modo adaptado**: la casilla «Que abra con el modo
  adaptado» le suma `&adaptado=1` al enlace, y la página lo enciende antes de
  pedir el nombre (y lo dice: «Tu profe te mandó este enlace con el modo
  adaptado»). No va a la base: es parte del enlace que se copia.
- **El enlace ya abre con la voz encendida**: la casilla «Que abra con la voz
  encendida» le suma `&voz=1`, para quien ve poco y no usa lector de pantalla.
  La página enciende la voz del navegador (la misma preferencia de todo el
  sitio) y lo deja escrito en `#vc-voz`. **Ningún navegador deja hablar a una
  página antes del primer toque o tecla**: lo que se diga antes se pierde sin
  error. Por eso el aviso se dice con el primer toque (`pointerup`, que es
  cuando el celular da el permiso, no `pointerdown`), salvo que ese toque sea
  el mismo botón de la voz. Se puede combinar con `&adaptado=1`, y los dos
  avisos salen juntos. La prueba lleva su propia cuenta del permiso: el
  navegador de prueba ya arranca con `navigator.userActivation` dado.
- **Desde la lista, en plena clase**: cada invitado lleva su botón «🦯
  Adaptado» (`aria-pressed`, con el nombre del invitado en su etiqueta), y la
  lista dice escrito quién lo tiene puesto. `clase_enlace_adaptado()` lo
  cambia en `clase_espectadores.adaptado`, solo a los invitados de ese profe
  (otro profe no puede, comprobado impersonando roles); `clase_invitado_ver()`
  lo devuelve y la página del invitado lo aplica: con el foco en el recuadro y
  «Tu profe te activó el modo adaptado» en la región viva y en la voz.
- **Lo que la persona cambia ella misma también llega a la lista**
  (`clase_invitado_modo()`, con su secreto), y al entrar se manda el modo que
  ya traía.
- **Solo se aplica el CAMBIO, y lo propio espera su confirmación.** Si la
  página copiara lo de la base en cada vuelta, lo que la persona apaga a mano
  se le volvería a encender. Y hay una carrera: una consulta que ya iba en
  camino trae el valor VIEJO, que parecería un cambio del profe. Por eso lo
  que la persona manda queda «por confirmar» y lo que traiga la base se
  ignora hasta que devuelva ese mismo valor (o pasen 10 s). Con esto, si el
  profe lo cambia en esos mismos segundos, su cambio se aplica recién al
  confirmarse: puede tardar hasta 10 s, y es un caso raro.
- El botón encendido lleva también su variante oscura
  (`dark:aria-pressed:…`): sin ella, en modo oscuro se veía igual que apagado.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-invitados
envios-publicos`.** El primero comprueba, con un doble de las cuatro funciones,
que sin la casilla no se entra, que el tablero muestra la posición y sigue la
vista del profe, que no hay enlaces en la clase, que tocar d7 y d6 no mueve,
que la primera salida se anota una vez y advierte, que la segunda saca y deja
de pedir el tablero, que al recargar sigue fuera, y del lado del profe los
avisos, la lista y el enlace nuevo; a la alumna no se le pinta nada. Y sin ver
la pantalla (con la voz interceptada para leer QUÉ diría): los dos botones,
cada aviso en `#vc-voz` y en la voz, el recuadro que pregunta y no mueve, el
foco, y que Esc no saque de la clase. Y el modo que pone el profe: el enlace
con `&adaptado=1`, el botón de la lista, que se aplique el cambio sin pisar lo
que la persona elige (falla sin esperar la confirmación, con la base que guarda
tarde). Está probado que falla con el tablero
movible, sin el freno de la salida doble, sin `cfg.anunciar`, contando la
salida de pantalla completa en Modo Adaptado y leyendo los emojis.
El segundo, que `clase_invitado_entrar` pase por el freno.

### El modo sencillo de la clase en vivo

Aun ordenada, la pantalla del profesor tiene catorce controles delante, y la
primera clase se da con los alumnos mirando. El modo sencillo deja a la vista lo
que hace falta para darla y guarda el resto a un clic.

- **Qué se ve en modo sencillo**: el grupo «El tablero — lo ve toda la clase»
  (debajo del tablero), el motor de análisis, los alumnos conectados y la
  pestaña «Mi plan». **Qué se guarda**: la tarjeta «Tu material» (Curso,
  Archivos, PDF, Armar posición) y las pestañas Táctica, Habilidades,
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
- **El botón va FUERA de los grupos**, en su propia fila: dentro de cada grupo
  solo viven sus botones, y `verificar-sesion-orden.js` no deja ni uno suelto.
  En modo sencillo se esconde la tarjeta entera de «Tu material» (es lo único
  que lleva), no solo sus botones: una tarjeta vacía no dice nada.
- Lo prueba `pruebaModoSencillo` en `verificar-sesion-orden.js`:
  - con una clase arranca sencillo (solo «Mi plan», y los alumnos a la vista); con tres, completo;
  - lo elegido en el aparato manda;
  - volver al sencillo con Táctica abierta abre «Mi plan»;
  - a la alumna no se le pinta nada.

  El doble compartido (`verificar-clase-registrada.js`) ahora sabe contar, y su
  `abrir()` entra por defecto con todas las herramientas (preferencia `"0"`),
  para que las pruebas de siempre encuentren cada botón.

### Las herramientas en grande

En la columna de 320 px, con letra de 11-12 px, a veces cuesta encontrar lo que
se busca. «🔎 En grande» (antes «Herramientas en grande»; en la fila del modo sencillo, fuera de la
barra) vuelve esa columna una ventana por encima del tablero, con todo más
grande; «✕ Volver al tablero» o Esc la cierran.

- **Es la MISMA columna, no una copia**: el `<aside id="herramientas-profe">`
  recibe la clase `herramientas-en-grande` (fija, encima de todo) y se le
  quita al cerrar. No se mueve ni se clona ningún nodo, así que cada botón
  sigue con sus eventos y lo que se cambia adentro (la pestaña abierta, lo
  escrito en Preguntar) sigue igual al volver. Una copia serían dos juegos de
  botones que se irían separando.
- **Se agranda con `zoom`** (1,15 en el celular, 1,3 en la tablet, 1,45 en la
  computadora), porque los `text-xs` y los px de Tailwind no crecen con el
  `font-size` del contenedor. Se mide: los botones de la barra salen al menos
  1,3 veces más altos.
- **El fondo es transparente pero oscurecido**: cada tarjeta lleva el suyo y
  entre ellas se ve el tablero apagado (azul de la marca al 55 %; en modo
  oscuro, negro al 60 %, porque el azul no se distinguía de las tarjetas). Se
  probó del todo transparente y las pestañas quedaban encima de las piezas,
  difíciles de leer, que es justo lo que la ventana vino a arreglar. La barra
  de arriba es una tarjeta fija y la nota del modo sencillo lleva su propio
  fondo.
- **Encima del encabezado (z-55) y debajo de lo que sí tiene que verse**: la
  pregunta al alumno (z-60), los avisos (z-70 y la capa superior de
  `<dialog>`).
- **Es un diálogo de verdad**: `role="dialog"` con `aria-modal`, el foco entra
  al título, lo de atrás queda `inert` (cada hermano del camino de la columna
  hasta `<body>`, y solo lo que no estaba inerte ya) y al cerrar el foco
  vuelve al botón que la abrió.
- **Lo que pasa fuera de la ventana la cierra**, para que se vea: un botón de
  «Tu material» (abre su panel al lado del tablero) y cualquier panel o diálogo que aparezca en la columna del
  tablero mientras está abierta (el panel del curso, mirar la práctica de un
  alumno…). Si no, quedaría tapado por la ventana e inerte. Cambiar de pestaña
  adentro no la cierra.

**Al tocar esto, correr `node herramientas/verificar-todo.js
herramientas-grandes`.** Está probado que falla de verdad: sin el zoom, sin que
la barra la cierre, y sin dejar inerte lo de atrás.

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
  `interno.clases_que_superviso()`. Cerrada la clase, 0 filas. La única
  escritura que se le abrió es la **ayuda en la práctica** (abajo).
- **Solo mira.** No mueve el tablero (no es interactivo), no marca asistencia
  ni tiempo en clase, no abre ni cierra la clase, no contesta preguntas, no
  juega la práctica ni entra al chat (esos son entre el profesor y cada
  alumno). Una supervisora anotada como alumna ensuciaría justo los registros
  que después revisa.
- **Sí ve la práctica y puede ayudar**, igual que el profe: ve la partida de
  cada alumno y le manda flechas y una pista a uno, sin jugar por él (ver «El
  profe mira la partida de un alumno y lo ayuda»). Nunca crea su propia
  partida: la página no le monta la tarjeta de alumna.
- **Entra a la presencia como `supervision`, no como alumna**: no aparece en la
  lista de alumnos del profesor ni en su chat. Ve quién está conectado.
- **El profesor ve que lo están mirando**: «👁 Marta Solano (supervisión) está
  mirando la clase.», arriba de la franja de la clase, y si está en la partida
  de un alumno, también: «Marta Solano está en la partida de Ana Rojas.» Mirar
  sin que el otro lo sepa no es supervisar.
- La videollamada sale como enlace solo si es `https`.
- Sin clase abierta, lo dice en palabras («Karina Rojas no tiene la clase
  abierta ahora») y lleva de vuelta a Supervisión; al cerrarse la clase,
  vuelve sola a Supervisión.
- Un alumno con `?observar=` en la dirección sigue siendo alumno: el modo solo
  se enciende con `es_supervisor`, `is_admin` o `es_coordinador`, y la RLS
  decide igual.
- **Quien coordina también mira** (y ayuda en la práctica), sobre sus
  profesores. Se llega desde «🔴 En clase ahora · Mirar la clase» en
  `coordinacion.html`, junto al profesor que tiene la clase abierta. El alcance
  es el de coordinación, preguntado con `bajo_mi_coordinacion()` y armado una
  vez en `interno.profesores_que_coordino()` y `interno.clases_que_coordino()`
  (de ésos, los que tienen la clase abierta). Las políticas son las mismas de
  supervisión con `_coordinacion` (`game_state`, `variant_nodes`,
  `profesor_videollamada`, `practice_sessions`, `practice_games` para leer y
  para la ayuda) más `class_sessions_select_coordinacion`, que hace falta para
  saber que la clase está abierta, para esa lista y para enterarse de que se
  cerró. Solo cuentas con `es_coordinador`: quien supervisa y quien
  administra ya tenían lo suyo.
  - **Se nombra por lo que es**: la insignia dice «👁 Coordinación», la
    presencia lleva `como: "coordinación"` (el rol de presencia sigue siendo
    `supervision`, que quiere decir «observa»), y el profe y el alumno leen
    «Luis Vega (coordinación)». Vuelve a `coordinacion.html`, no a
    Supervisión. Quien supervisa y coordina a la vez entra como supervisión.
- **Quien administra también mira y ayuda**, en todas las clases: la base ya
  se lo daba (`is_admin` en las políticas de siempre de `game_state`,
  `variant_nodes`, `profesor_videollamada`, `practice_sessions` y
  `practice_games`; de la partida, el trigger le deja cambiar solo la ayuda) y
  entra desde Supervisión, que le lista a todos los profesores con «En clase
  ahora». Lo que faltaba era nombrarlo: entraba como «Supervisión» y el profe y
  el alumno leían «(supervisión)». Ahora es «👁 Administración» y
  «(administración)»; con varios papeles gana el más amplio (administración,
  después supervisión, después coordinación). Comprobado impersonando a la
  cuenta master: ve el tablero y la partida, y su ayuda entra con su nombre
  sin tocar las jugadas.
  - Comprobado impersonando roles en SQL (revertido): la coordinadora ve la
    clase, el tablero y la partida del profesor de su academia, y su ayuda
    entra con su nombre sin tocar las jugadas; los de un profesor de otra
    academia, 0; una coordinadora sin gente, 0; cerrada la clase, las
    políticas nuevas dan falso (la que se probó seguía viendo la partida por
    ser también profesora del alumno, un acceso que ya tenía).
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

#### Al cerrar se ve lo que hizo cada alumno

Las preguntas («¿Qué jugarías?») y las prácticas contra el motor **no tenían
clase**: lo que contestó cada alumno quedaba guardado, pero no había forma de
decir «en la clase del martes Ana contestó 4 de 5». No daba ningún error: esos
datos simplemente no llegaban a ningún lado.

- **La liga la pone un trigger, no la página**: `ligar_a_la_clase_abierta`
  (BEFORE INSERT en `questions` y `practice_sessions`) les pone la clase
  abierta de quien las crea. En `sesion.js` hay cinco lugares que crean una
  pregunta y cuatro que abren una práctica, y el que se olvidara de mandar la
  clase la dejaría fuera sin avisar. Sin clase abierta queda en null: una
  pregunta de preparación no es de ninguna clase. Es SECURITY INVOKER (el
  profesor ya puede leer sus clases) y no se le deja ejecutar a nadie.
- **La cuenta la hace la base**: `resumen_de_la_clase(p_clase)`, SECURITY
  INVOKER, así que la RLS decide quién ve qué. Comprobado impersonando: el
  profesor ve a los suyos, otro profesor recibe cero filas y la alumna solo la
  suya. Entran los que asistieron **y** los que contestaron sin quedar en la
  asistencia: nadie que hizo algo se pierde.
- **No se guarda**: se deriva de las respuestas y el profesor puede seguir
  calificando después, así que una foto al cerrar quedaría vieja. Se calcula
  cada vez.
- **Se ve al primer toque de «Cerrar la clase»**, junto al título y la nota:
  es el momento en que todavía se pueden calificar las respuestas que faltan,
  y el titular dice cuántas quedan («Queda 1 respuesta sin calificar»).
  Calificar una con el cierre abierto lo vuelve a contar.
- **En el registro del panel**, cada clase en línea tiene «Qué hicieron», que
  lo pide **al abrirlo** (con `aria-expanded`): una llamada por clase para
  cien clases sería pedir cien veces algo que casi nunca se mira.
- Lo pinta `js/resumen-clase.js` (una sola copia para las dos pantallas), todo
  **escrito** —«2 de 3 contestadas: 1 bien, 1 sin calificar», «1 partida: 1
  ganada»— y en una tabla con sus `scope`, porque lo copia quien arma el
  informe.

**Al tocar esto, correr `node herramientas/verificar-todo.js clase-resumen
panel`.** El doble de `verificar-clase-registrada.js` cuenta
`resumen_de_la_clase` de sus propias tablas, como la base. Está probado que
falla de verdad: sin pedir el resumen al cerrar, se cae.

### La clase presencial también se registra, y es una `class_sessions` MÁS

La clase del aula no existía para el sitio. El profesor daba su clase
presencial, y esa clase no salía en Informes, no contaba para el «asistió a 4 de
5» que llega a la casa, no entraba al reporte de actividades y no sumaba al
«clases este mes» de su panel. No daba ningún error: simplemente, para la
plataforma, el alumno que solo va presencial no entrenaba nunca.

`asistencia.html` (tarjeta **«✅ Asistencia presencial»** en «Tus clases», al
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
callado, así que se mira desde afuera: que **la hora de Costa Rica viaje como el
instante que fue** —el verificador fija la zona en `America/Costa_Rica` y comprueba que
las 15:00 salgan como las 21:00 UTC; mandar los dos campos como si fueran UTC
deja la clase fechada el día siguiente sin dar ningún error. Los dos campos se
leen como hora de Costa Rica con `HoraCR.desdeCampo()`, no en la zona de la
computadora: una mal configurada, o la de alguien de viaje, corría la clase
sin avisar (ver «Las fechas y las horas, siempre en hora de Costa Rica» en
sitio-e-infraestructura.md)—, que el buscador
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

### En un monitor ancho, los alumnos conectados van a la izquierda

La sesión topaba en 1024 px (`max-w-5xl`): en un monitor de 1920 quedaba media
pantalla vacía a los lados. Ahora, **solo desde 1440 px de ancho y 801 de alto**,
`css/styles.css` ensancha la sección a 88rem y arma tres columnas: **«Alumnos
conectados» a la izquierda**, el tablero en el centro y a la derecha el motor, el
material y las pestañas. Debajo de esas medidas no cambia nada.

- **El tablero se queda en sus 560 px.** Primero se probó hacerlo crecer con la
  altura de la ventana (hasta 720, #675) y al profesor le quedó demasiado
  grande: lo que pedía era usar el espacio de los lados, no agrandar el tablero.
- **No se mueve ningún nodo.** «Herramientas en grande» abre esa misma columna
  como ventana, con los alumnos adentro (ver «Las herramientas en grande»). En
  vez de mudar el panel, la columna se vuelve `display: contents` y sus tarjetas
  se acomodan en la cuadrícula de afuera; con la ventana abierta
  (`.herramientas-en-grande`) la regla deja de valer y todo vuelve a su sitio.
- **La última fila es `1fr`** y el tablero y los alumnos ocupan todas las filas:
  así lo alto de la columna del tablero cae en esa fila y no estira las de las
  tarjetas de la derecha. Por eso el espacio entre tarjetas va como margen y no
  como `row-gap`, que contaría también las filas vacías de las escondidas.
- **Solo con el panel de alumnos a la vista** (`:has(#students-panel:not(.hidden))`):
  el alumno no lo tiene, y le quedaría una columna vacía.
- **El proyector y el control remoto quedan fuera**, y el `:has` de la sección
  acota todo a `sesion.html`: `styles.css` lo carga todo el sitio y hay otras
  veinte páginas con un `#app`. El encabezado y las migas se ensanchan lo mismo
  para que el logo siga alineado con el contenido.
- `verificar-sesion-curso.js` mide a 1920 y a 1280 px dónde cae cada tarjeta y
  que la ventana grande siga trayendo a los alumnos; devolviendo el panel a la
  derecha, salta.

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

### La práctica no recarga la lista en cada jugada

El 29 de setiembre, de 6:00 a 6:35 p. m., la base se quedó sin CPU y el sitio
dejó de cargar para todos: 240 consultas cortadas por el tope de 8 s, y hasta
`hora_servidor_ms()`, que solo devuelve la hora, tardaba 5,9 s. A las 5:46 había
arrancado una ronda de práctica con 13 alumnos contra el motor. La pantalla del
profe escuchaba `practice_games` y, **con cada cambio de cualquier fila** —cada
jugada del alumno y cada respuesta del motor—, volvía a pedir la lista entera
con los perfiles (`select("*, profiles(…)")`, que además pasa por la RLS de
`profiles`). Esa sola computadora hizo 466 pedidos en 15 minutos, y quien
supervisaba la clase hacía lo mismo. Sumado a unas 40 personas abriendo sus
paneles, el tráfico pasó de ~700 pedidos cada 15 minutos a casi 8000, en el
servidor más chico de Supabase.

Ahora (`aplicarCambioDePractica()` en `sesion.js`):

- **Un UPDATE de un alumno que ya está en la grilla se pinta con la fila del
  evento**, sin consultar. Se **mezcla** con la que ya estaba: Realtime no manda
  las columnas grandes que no cambiaron (con la identidad de réplica por
  omisión, un `moves` o un `ayuda` sin tocar no viene), y el nombre sale del
  join de la primera carga, que el evento no trae.
- **La lista se vuelve a pedir solo cuando entra o sale un alumno** (INSERT,
  DELETE o una fila que la grilla no conoce), y las altas que llegan juntas
  —la clase entera arrancando la ronda— se juntan: mientras hay una consulta en
  vuelo, las demás esperan y dan una sola más.
- **Una consulta que vuelve tarde no pisa una jugada más nueva.**
  `practice_games.updated_at` no sirve para ordenar (nada lo actualiza), así
  que cada fila pintada por un evento lleva un número de orden, y la carga
  completa salta las que recibieron un evento después de salir.

`verificar-practica-ayuda.js` manda tres jugadas como las manda Realtime (sin el
perfil) y exige cero consultas de la lista, la última jugada pintada y el nombre
intacto. También manda un evento sin `moves` (no puede vaciar el tablero) y tres
avisos de alta seguidos (a lo sumo dos consultas). Con el código viejo salta: 3
consultas con tres jugadas y 7 con tres altas.

### El profe mira la partida de un alumno y lo ayuda

Las miniaturas dicen a quién ayudar, pero a 190 px no se lee una partida, y
ayudar era hablarle al alumno por la llamada («fíjate en tu caballo»)
mientras él miraba otra cosa. Ahora cada miniatura trae **«👁 Mirar y
ayudar»**: abre SU partida en grande (`#practica-mirar`), en vivo, y le deja
al profe mandarle una **ayuda** —flechas, círculos y una pista escrita— que al
alumno le aparece en su propio tablero.

- **Solo mira, y eso lo pone la base.** El tablero grande no es interactivo,
  pero la política `practice_games_update` ya dejaba escribir a sus
  profesores y a administración (para destrabar una partida). El trigger
  `practica_ayuda_proteger` hace que, para quien no es el alumno, la fila
  quede **entera** como estaba salvo `ayuda`: se copia la fila vieja completa
  (`new := old`) y no columna por columna, porque la primera versión nombraba
  las columnas y ya se le había escapado `reloj_ms` —el profe podía cambiarle
  el reloj— sin ningún error. Una columna que se agregue mañana queda cubierta
  sola.
- **La ayuda no se la escribe el alumno**: su update deja `ayuda` como
  estaba. Y al **reintentar** (`attempts` cambia) la base la borra: era de la
  partida anterior. Con la ronda terminada ya no entra ayuda nueva. Quién la dio
  y cuándo (`de`, `en`) los pone el trigger, no quien la manda.
- **La forma la cuida un CHECK** (`practice_games_ayuda_forma`): objeto, el
  número de jugadas de la posición, a lo sumo 12 flechas y 12 círculos, pista
  de hasta 280 caracteres. Va envuelto en `coalesce(..., false)`: sin él, una
  ayuda sin `jugadas` pasaba (el `jsonb_typeof` de una clave que falta da NULL,
  y un CHECK en NULL pasa) — comprobado impersonando al profe, y corregido en
  `practica_ayuda_forma_sin_nulos`.
- **Las flechas son de UNA posición.** La ayuda guarda `jugadas`, y el alumno
  las ve solo mientras su partida tenga ese número de jugadas: después de la
  siguiente señalarían otra cosa. La pista sigue a la vista, y se le dice que
  las flechas eran para antes de su jugada. Del lado del profe, cuando el
  alumno (o el motor) mueve, se borran las flechas que tenía dibujadas y el
  estado lo dice.
- **Todo va también escrito.** El alumno lee «En tu tablero: una flecha de g1
  a f3» en una región viva que está SIEMPRE en la página (vacía si no hay
  ayuda: una región que aparece no se anuncia). El profe puede **escribir**
  las flechas («g1-f3 e4») en vez de dibujarlas con clic derecho: lo que se
  dibuja se escribe en el mismo campo, y lo que no se entiende se dice y no se
  manda. Lo que no depende de la página (limpiar lo que llega, leer y decir
  las marcas) está una sola vez en `js/practica-ayuda.js`.
- **También quien supervisa, y quien coordina** (`sesion.html?observar=`; ver
  «La clase en vivo, vista por quien supervisa»): ve la práctica y
  ayuda igual, con el alcance de todo lo demás que mira —solo mientras ese
  profesor tiene la clase abierta y solo si lo supervisa—
  (`practice_sessions_select_supervisor`, `practice_games_select_supervisor` y
  `practice_games_update_supervisor`, sobre `interno.clases_que_superviso()`).
  El update no le abre nada más que la ayuda: es el mismo trigger. Su página
  no le monta la tarjeta de práctica de alumna, así que no crea partida ni
  queda anotada. La base no se lo impide —`practice_games_insert_own` deja a
  cualquiera crear SU propia partida, como siempre—: lo que la protege es que
  ninguna pantalla de supervisión lo hace, y el verificador exige que no
  escriba ningún insert.
- **La ayuda dice de quién es.** El trigger le pone el `nombre` de quien la
  dio (no quien la manda, que podría escribir cualquiera): el alumno lee
  «Ayuda de Marta Solano» cuando no fue su profe, y la miniatura, «con ayuda
  de Marta Solano».
- **El alumno sabe que lo están mirando**: «👁 Karina Rojas está mirando tu
  partida.», o «Marta Solano (supervisión) está mirando tu partida.» Viaja en
  la **presencia** (`mirando_a`), no en la base:
  al cerrar el diálogo, terminar la ronda o cerrar la pestaña se va solo, y
  nunca queda un «te están mirando» de alguien que ya no está. Mirar sin que el
  otro lo sepa no es ayudar.
- **Se mira lo que QUEDÓ, no lo que se mandó**: el update pide la fila de
  vuelta, porque con la ronda terminada el trigger la devuelve como estaba sin
  dar error, y la pantalla diría «le llegó» de algo que no llegó.
- El alumno escucha su partida por Realtime **con filtro**
  (`student_id=eq.<su id>`) y de ese aviso toma **solo la ayuda**: las jugadas
  las lleva su navegador, y un eco atrasado de la base se las pisaría.

- **El alumno también la pide**: «🙋 Pedir ayuda» en su tarjeta de práctica.
  El pedido vive en su fila (`practice_games.pide_ayuda_at`, migración
  `practica_el_alumno_pide_ayuda`) y no en un mensaje suelto, porque quien
  entra después a mirar —el profe que recarga, supervisión, coordinación—
  también tiene que verlo. Lo hace cumplir el mismo trigger: el alumno lo
  enciende y lo apaga, y la hora la pone la base (pedir otra vez no la corre:
  el que pidió primero sigue primero); quien no es el alumno solo puede
  APAGARLO, nunca encenderlo a su nombre; mandarle una ayuda lo da por
  atendido, y reintentar la partida lo apaga.
  - Al profe (y a quien observa) la tarjeta se le marca **con texto**
    («🙋 Pide ayuda») además del borde, **sube al principio** de la grilla
    (`order: -1`: sin eso, con veinte alumnos el pedido queda abajo, fuera de
    la pantalla), la cuenta de arriba lo suma y se dice en voz una vez por
    pedido (`#practica-pedidos-aviso`). En el diálogo, «✔ Marcar como atendido» lo
    apaga sin mandar nada: muchas veces se ayuda de palabra, por la llamada.
  - Al alumno el botón le dice que pidió y le deja cancelar
    (`aria-pressed`), y cuando alguien lo atiende se le dice.
  - Comprobado impersonando roles (revertido): la hora que manda el
    navegador se ignora; pedir otra vez o jugar no la corre; la ayuda del
    profe lo apaga; el profe no lo puede encender; sí apagarlo; la alumna lo
    cancela; al reintentar se apaga.

- **El alumno le contesta a quien lo ayudó**: debajo de la ayuda, «💬
  Contestarle» (hasta 280 caracteres). Vive en su fila
  (`practice_games.respuesta`, `respuesta_at`, migración
  `practica_el_alumno_contesta`) y **no en el chat privado**: el chat es solo
  entre el alumno y su profe, y la ayuda la puede haber dado alguien de
  supervisión o coordinación, que tiene que leer la respuesta ahí mismo donde
  la mandó. El mismo trigger lo hace cumplir: solo el alumno la escribe, y
  solo si tiene una ayuda a la que contestar (el campo tampoco sale sin ella);
  la hora la pone la base; texto vacío la quita; quien no es el alumno no la
  toca; **una ayuda nueva, o quitar la ayuda, la borra**, porque contestaba a
  otra; reintentar también. Al profe le sale en la miniatura y en el diálogo,
  siempre por `textContent` —es texto que escribe un alumno—, y se dice en voz
  una vez por respuesta. Comprobado impersonando roles: sin ayuda no entra; la
  hora falsa se ignora y los espacios se recortan; jugar no la borra; el profe
  no la puede cambiar; 281 caracteres los rechaza el CHECK; la ayuda nueva, el
  texto vacío y el reintento la borran.
- **Una pista para todos a la vez**: arriba de «Tableros de los alumnos»,
  «📣 Pista para todos». Va **solo texto**: cada alumno va en una posición
  distinta, y una flecha dibujada en una señalaría otra cosa en las demás. Es
  **un solo update filtrado por la ronda** (`session_id`), no un bucle por
  alumno: la RLS decide a qué partidas llega (las del profe, o las que alcanza
  quien observa) y el trigger le pone a cada una quién la dio y apaga los
  pedidos de ayuda —no hizo falta migración—. La ayuda lleva `para_todos` y el
  alumno la lee «Pista de tu profe para toda la clase». **Reemplaza** la ayuda
  individual que tuviera cada uno, y la nota del campo lo dice. Se cuenta lo
  que QUEDÓ guardado («Le llegó a los 12 alumnos», «a 10 de 12»), porque con la
  ronda terminada la base la devuelve como estaba. Comprobado impersonando
  roles: el profe la manda a las dos partidas de una vez, cada una con su `de`,
  sin tocar las jugadas y apagando el pedido; una alumna no se la puede mandar
  a nadie.
  - El doble de `verificar-clase-registrada.js` cambiaba solo la PRIMERA fila
    de un update; ahora cambia todas las que cumplen el filtro, como la base.
    Con el de antes, «le llegó a los 2» se habría visto bien habiendo cambiado
    una sola.

Comprobado impersonando roles en SQL (revertido): el profe manda la ayuda y
queda con su `de`, pero sus cambios a jugadas, estado, intentos y reloj se
devuelven; el alumno no puede cambiarla y sí juega; al reintentar se borra; con
la ronda terminada no entra; otro profesor cambia 0 filas; una sin `jugadas` o
con una pista de 281 caracteres la rechaza el CHECK. Con supervisión
(`practica_ayuda_tambien_supervision`): con la clase abierta la supervisora ve
la ronda y la partida (y el nombre del alumno), su ayuda entra con su nombre y
sus cambios a jugadas y estado se devuelven; un profesor de otra academia ve 0
y cambia 0; cerrada la clase, la política de supervisión da falso.

**Al tocarlo, correr `node herramientas/verificar-todo.js practica-ayuda
sesion-curso clase-supervisor coordinacion`.** `verificar-practica-ayuda.js`
comprueba las pantallas del profe, de supervisión, de coordinación y del
alumno:
que el tablero del profe no mueva ni mande nada, que lo que se manda sea solo
la ayuda y a esa partida, que diga cuándo la base no la guardó, que la
presencia diga a quién mira y vuelva a nadie, que al alumno se le pinten las
flechas solo en su posición y en palabras, y que lo que él guarda nunca lleve
la ayuda. Está probado que falla de verdad: pintando las flechas en cualquier
posición y sin volver la presencia a nadie al cerrar, saltan cinco
comprobaciones; sin cargar la práctica para supervisión, o sin anunciar su
presencia, también.

Escape cierra el diálogo escuchando en todo el documento, no en el diálogo:
al mandar, el botón se desactiva mientras guarda y el foco se cae al `body`,
así que un Escape escuchado en el diálogo dejaba de cerrarlo.

### Llevar la partida de un alumno a la clase

Para corregir cómo juega un alumno hay que mirar SU partida con toda la clase, y
hasta ahora solo se podía mirar de a uno (la miniatura, «👁 Mirar y ayudar») o
abrirla en otra pestaña. Ahora el profe la pone en el tablero de todos
(`js/clase-traer-partida.js`), por tres puertas que van a una sola función,
`llevarPartidaALaClase()`:

- **«📥 Llevarla a la clase»** en «👁 Mirar y ayudar»: la práctica contra el
  motor que está jugando ahora. Solo quien da la clase: quien supervisa ayuda,
  pero no cambia el tablero.
- **«📥 A la clase»** en cada renglón de «Partidas entre alumnos».
- **«📥 La partida de un alumno, en la clase»** (pestaña Practicar): se elige
  al alumno (los que están en la clase primero) y salen sus últimas partidas
  —las prácticas contra el motor y las partidas en línea estándar—, de la más
  nueva a la más vieja, con el rival por su nombre (`nombres_de_jugadores`,
  sin el correo). Qué partidas ve el profe lo decide la RLS: `practice_games`
  y `game_rooms` ya le dejaban leer las de sus alumnos.

**La partida entra entera y se muestra desde la primera jugada.** Pasa por
`aplicarPosicionEnClase()` —que ahora acepta las jugadas— como todo lo que pone
algo en el tablero de la clase: limpia variantes, comentarios y el control del
alumno. Y la vista (`game_state.vista`) queda en la jugada 0: se recorre con la
clase y se corrige con las variantes y los comentarios de siempre. Una jugada
que no se puede reproducir corta la partida ahí, y se dice.

**`game_rooms` no guarda la posición de salida**, solo la actual y las
jugadas. Se comprueba reproduciendo: desde `variant_state.inicio` (lo guarda
ahora «Emparejar» cuando arma las partidas desde la posición del tablero) o
desde la inicial; si las jugadas no llevan a la posición guardada, la historia
no se conoce, y el renglón lo dice («no se sabe desde dónde empezó») en vez de
ofrecer una partida equivocada.

### La práctica con un límite de intentos

El profe elige, al lanzar la práctica, **cuántas partidas puede jugar cada
alumno** (`practice_sessions.max_intentos`: sin límite, 1, 2, 3 o 5; la primera
cuenta, así que «3» es la partida y dos reintentos). Sin límite no se manda la
columna. La ronda lo dice («3 intentos por alumno»), la miniatura «intento 2 de
3», y el alumno «Intento 2 de 2» junto al nivel; sin intentos, «Reintentar» no
sale y se le dice por qué («Ya usaste tus 2 intentos de esta práctica.»).

**Lo hace cumplir la base**, porque reintentar es un update de su propia fila
y se puede mandar desde la consola (migración `practica_limite_de_intentos`,
en el trigger `practica_ayuda_proteger`, rama del alumno):

- `attempts` sube **de a uno** y nunca baja: si no, se reiniciaría la cuenta
  mandando `attempts = 1`;
- no pasa del tope de la ronda;
- una partida terminada **no vuelve a «jugando» sin gastar un intento**: si
  no, se reintentaría con `moves = []` y `status = 'playing'` con el mismo
  número;
- al crear su fila, arranca en el intento 1 mande lo que mande
  (`practica_intento_inicial`).

Si la base rechaza el reintento, la pantalla no reinicia nada y lo dice.

### El aviso de que el bot ya jugó

El alumno mueve, el motor piensa un momento y contesta; si en ese rato miró
otra cosa —el chat, la llamada, otra pestaña— no se enteraba de que ya le
tocaba. Ahora, en la práctica de la clase:

- **la jugada queda escrita** encima del tablero, «🔔 El motor jugó Cf6. Te
  toca.» (en notación española, o dicha en palabras en Modo Adaptado), hasta
  que el alumno juega. No es región viva: en voz ya lo dice el cuadro de
  comandos, y dos regiones diciendo lo mismo lo harían oír dos veces;
- **suena un pitido** y, si la pestaña no está a la vista, el título
  parpadea y sale la notificación del sistema si ya había permiso
  (`TurnAlert.botJugo`, en `js/turn-alert.js`, el mismo aviso de las
  partidas en línea). No se pide permiso de notificaciones en medio de la
  práctica;
- **el sonido se apaga** con «🔔 Sonido cuando juega el motor» (`aria-pressed`):
  en un aula con veinte computadoras pitando a la vez hace falta. Se recuerda
  en el aparato (`aviso_bot_sonido`), y vale para todos los bots del sitio;
- si cerró la tarjeta con la ✖, el botón para volver dice «¡te toca!».

Lo mismo en el bot de Oscar (`js/tablero-board.js`: «Oscar jugó Cf3. ¡Tu
turno!») y en `bot.html` («El bot jugó Cf3. Es tu turno.»), salvo en la
niebla, donde la jugada del rival es justamente lo que no se ve: ahí suena,
pero no se dice cuál fue.

**Al tocar cualquiera de las tres cosas, correr `node
herramientas/verificar-todo.js clase-traer-partida clase-partidas
practica-ayuda`.** Está probado que falla de verdad: sin mostrar la partida
desde la jugada 0, o con «Reintentar» a la vista sin intentos, salta. El doble
de `verificar-clase-registrada.js` contesta ahora `nombres_de_jugadores` como
la base (`{id, nombre}`), así que `verificar-clase-partidas.js` nombra a Ana.

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

### Los entrenamientos, en la clase

La pestaña **«🧠 Entrenamientos»** del profe (antes «Habilidades», que ahora
es una de sus tarjetas) trae todos los entrenamientos del sitio a la clase:
Mates, Aprender, Desafíos, Fichas de estudio, Aperturas y celadas,
Visualización, Precisión posicional, Finales contra la máquina, Memoria,
Habilidades, y los que se hacen en su propia página (Coordenadas, 4×4,
Practicar, el Sonar…). Es `js/clase-entrenamientos.js`. Para cada ejercicio:
mostrarlo para explicarlo, preguntarlo a la clase y que lo practiquen.

- **La lista no está escrita en la clase: sale de
  `MaterialPlataforma.HERRAMIENTAS`** (`js/material-plataforma.js`), la misma
  de Tareas. Un entrenamiento nuevo que se agrega ahí aparece solo, en «Se
  hacen en su página» con «📲 Que lo abran todos»; si además se le escribe su
  adaptador (`ADAPTADORES_ENTRENO`), pasa a «Con el tablero de la clase» con
  su lista. `verificar-clase-entrenamientos.js` revisa que cada tarjeta del hub
  (`entreno/index.html`) esté en esa lista: si alguien agrega una tarjeta y no
  la anota, salta. Quedan afuera Táctica (tiene su pestaña), los diagnósticos,
  los cuestionarios y el plan contra un rival.
- **Los datos son los de cada página, sin copia.** Los JSON de `entreno/data`
  y los módulos de `js/` (`aperturas-lineas.js`, `fichas-estudio.js`,
  `precision-posicional-items.js`, `aprender-lecciones.js`) se cargan recién
  al abrir esa tarjeta. Las lecciones de Aprender vivían dentro de
  `js/entreno-aprender.js`, que pinta la página: se mudaron tal cual a
  `js/aprender-lecciones.js` (siguen siendo los mismos globales), y
  `verificar-practicar-aprender.js` y `contenido-panel.js` las leen de ahí.
- **Cada ejercicio trae sus puertas, las de siempre**: «👁 Vista previa»
  (`crearVistaPreviaLote`), «📥 Al tablero» (`aplicarPosicionEnClase`),
  «❓ Preguntar» (`crearPregunta`, con las jugadas del alumno sacadas de la
  solución; Precisión posicional, de opciones, con
  `hacer_pregunta_de_opciones`, así la correcta queda en la base), «🔥
  Calentamiento» (`mandarCalentamiento`), «🤖 Que lo jueguen contra la
  máquina» (Finales, `crearPractica`), «📸 Mostrar y ocultar» (Memoria, la
  Fotografía de Habilidades) y «🔎 Guion»: lo que ve solo el profe para
  explicarlo (la solución, la idea, la explicación de la ficha).
- **«Que lo practiquen» es el calentamiento de `js/clase-tanda.js`** con los
  ejercicios de ese grupo, con nota o en competencia: la receta lleva `banco`
  (`mates`, `desafios`; sin él, Táctica) y `filtro` (`cat:mate2`,
  `tema:fork`, `largo:l3`), y cada alumno arma sus ejercicios de ahí
  (`TandaCalentamiento.normalizar`/`filtrar`). Los que no tienen rating llevan
  el centro de su categoría; el nivel de la receta es la mediana de esa parte
  del banco. Así practicar Mates, un tema de una ficha o un nivel de
  Visualización no necesitó otro mecanismo.
- **Ninguna posición se inventa ni se cuela una inválida.** El verificador
  carga TODOS los ejercicios de todos los adaptadores (más de 3000) y
  comprueba que el tablero de la clase acepta cada posición y que cada
  solución se juega con chess.js (las de Mates, hasta el mate). De Desafíos
  solo van los que tienen los dos reyes: los otros se hacen en su página.
- **«🪟 Abrirlo a todos en una ventana» no manda una dirección**: manda el
  slug (y el recorte) en la presencia del profe, como la Fotografía, y cada
  alumno arma el enlace con la lista del sitio (`EntrenosClase.enlaceDe`).
  Solo cuenta lo que anuncia el dueño del tablero: lo que anuncie otro no
  abre nada.
- **Coordenadas, 4×4 y los que tienen su propio tablero se abren en una
  ventana encima de la clase** (`#entreno-ventana`), como la práctica contra
  el motor: la página del entrenamiento va en un marco. Antes se abrían en
  otra pestaña, y el alumno salía de la clase. No se mudaron a la clase: cada
  página es un script atado a su propio HTML (`gate`, `app`, `unlock`…), y
  cargarlo en `sesion.html` chocaría con el de la clase.
  - **La página, en su modo «en clase»** (`?en-clase=1`, `js/main.js`): sin
    encabezado, migas, pie ni lo que flota (burbuja, avisos), que la clase ya
    tiene. Solo dentro de un marco: abierta sola, aun con `?en-clase=1`, es la
    de siempre.
  - **Se abre sola UNA vez por pedido**; «Volver a la clase» (o Escape) la
    cierra sin recargarla, y el aviso debajo del tablero deja volver («Volver
    a «Coordenadas»»). Si el profe la cierra a todos («Cerrar la ventana a
    todos»), se cierra y el marco se vacía, para que no siga corriendo nada.
    Arriba lleva «Abrir en otra pestaña», para quien lo prefiera.
  - **Para eso el sitio se deja enmarcar, solo por sí mismo**: ver «Las
    páginas se enmarcan solo dentro del sitio» en `sitio-e-infraestructura.md`.
- **Ordenado, sin saturar**: el catálogo en dos partes, cada entrenamiento en
  grupos, y las listas de a 30 con «Mostrar más». Las migas («‹
  Entrenamientos ‹ Mates») dicen dónde se está.

**Al tocar esto, correr `node herramientas/verificar-todo.js
clase-entrenamientos sesion-curso`.** Está probado que falla de verdad: con
una solución cortada (no da mate), aceptando el pedido de cualquiera, sin
abrir la ventana sola o con el encabezado a la vista dentro del marco, salta.

#### Habilidades (los Tipos de entrenamiento)

> En pantalla, la tarjeta y el panel se llaman «Habilidades» (ver «Los Tipos
> de entrenamiento» en `entrenamiento.md`).

La tarjeta «🧩 Habilidades» de la pestaña **"🧠 Entrenamientos"** lista los diecinueve Tipos de
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

### Todo lo que lanza el profe, contestado sin ver

Con las cuentas ciegas marcadas se repasó cada cosa que el profe puede lanzar
en la clase. Lo que faltaba:

- **Las flechas y los círculos del profe se dicen** («Tu profe marcó una flecha
  de cesar 1 a cesar 8, la casilla bella 7.»), solo los nuevos. Lo hacía
  `ver-clase.js` y el alumno de la clase no: la lógica vive ahora UNA vez en
  `ClaseAdaptada.vigiaDeMarcas()`, que usan las dos páginas. `ClaseAdaptada`
  junta en un solo aviso lo que llega en 60 ms (jugada, variante, marcas) para
  que un aviso no pise al otro.
- **Las preguntas de opciones se contestan escribiendo** («B», «opción b»,
  «2»): el recuadro ya no se esconde en ellas y manda por `enviarOpcion()`, la
  misma función del botón. Los botones llevan escrito «Opción A. …».
- **Fotografía**: al mostrarla, el profe manda un aviso `fotografia` por el
  canal de la presencia y el alumno oye cuántos segundos tiene y la posición
  entera. Va por la presencia porque la fila de `game_state` no dice que sea
  una Fotografía; si el alumno recarga en esos segundos, no oye el dictado.
- **El calentamiento** se lleva el foco a su recuadro en Modo Adaptado, y sus
  avisos (y la confirmación de «¿Qué jugarías?») dicen la jugada en palabras.
- **El tablero de la clase se recorre como los demás**: `ClaseAdaptada.montar`
  monta `TableroAccesible` sobre los tableros de la clase (no las miniaturas):
  `aria-roledescription`, rol de aplicación, los atajos o/z/m/x e «i» para
  volver al recuadro; Alt + Mayúscula + B lo encuentra. `ClasesBoard` le deja
  las flechas (si no, cada flecha repintaba dos veces), sigue la casilla con el
  foco al repintar y conserva el texto de sus casillas, porque solo él sabe si
  las piezas están ocultas: con ellas ocultas, las teclas que cuentan piezas
  contestan «Las piezas están ocultas».
- **«última jugada» y «jugadas»** en el recuadro de la clase: los contesta
  `js/comandos-tablero.js`; `ClaseAdaptada` solo le pasa «jugadas» a secas y el
  caso de las piezas ocultas.
- **El aviso de partida asignada** (`js/juego-aviso.js`) no manda al tablero a
  los 4 s en Modo Adaptado: con lector no alcanza para oírlo. Dice «Cuando
  estés listo, activa «Entrar ahora»».

Lo miran `verificar-clase-adaptada.js` (y `clase-invitados`, `juego-aviso`,
`clase-preguntas`, `clase-encuesta`).

## «Activar voz»: la clase dicha en voz alta para quien ve poco

Quien ve poco muchas veces **no usa lector de pantalla**: agranda la letra y se
acerca, y el tablero de la clase cambia sin que se entere. El 🔇 del encabezado
(«Activar voz», el mismo de todo el sitio: ver «“Activar voz” en todo el sitio»
en accesibilidad.md) hace que el navegador diga en voz alta las regiones vivas
de la clase: la jugada del profe, «te dio el control», la pregunta, el tiempo.

Lo propio de la clase:

- **La jugada del profe se dice aunque el Modo Adaptado esté apagado.** Se
  anuncia en el aviso del recuadro de comandos (`.cc-msg`), que fuera del modo
  es `display:none`; `js/voz-pagina.js` lo juzga por el lugar donde está
  montado, no por la caja.
- **La jugada propia hecha con clics la dice el tablero** («Torre blanca de
  david 1 a david 5»: ver las jugadas del tablero en accesibilidad.md), y **la
  del profe no se oye dos veces**: la dice el aviso («Se jugó…») y el tablero se
  calla. La prueba de que no se repite atrapó que `/jugó\b/` no calzaba nunca.
- **El destape de `#app` no es un aviso**: se empieza a escuchar cuando `#app`
  se ve, y lo que ya estaba escrito se anota como dicho.
- Al principio el botón vivía en el renglón del título, y en el celular lo
  partía en dos y el tablero bajaba de los 240 px de `verificar-clase-movil.js`.
  En el encabezado, como ícono, no ocupa lugar nuevo.

**Al tocarlo, correr `node herramientas/verificar-todo.js clase-voz voz-pagina
clase-movil`.** `verificar-clase-voz.js` cambia `speechSynthesis` por uno que
anota lo que dice y comprueba, como alumna sin Modo Adaptado: que apagada no
diga nada, que al encenderla confirme, que la jugada del profe se diga una sola
vez, que «te dio el control» se diga y el eco no lo repita, que un panel
escondido no hable, que `#clase-voz` se oiga, que al recargar no lea los
carteles y que apagarla la calle. Está probado que falla de verdad: sin la
excepción de `.cc-msg` salta la jugada del profe, y sin la regla del mismo
texto salta el eco.
