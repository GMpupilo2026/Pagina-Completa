# Los paneles

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: el panel de la Academia, la burbuja de conectados, Administración y las inscripciones a torneos.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

## El panel de la Academia

`clases.html` es por donde entra todo el mundo. Sus accesos viven en
`TILE_GROUPS`, un solo lugar: mover un acceso de grupo es cambiarle el objeto de
lista, y el resto se acomoda solo.

- **"Aprender" va antes que "Jugar y competir".** Esto es una academia: lo
  primero que se ofrece al entrar es lo que se viene a hacer. Jugar queda
  justo debajo, a un golpe de vista — no se esconde, se ordena.
- **Mover un grupo de lugar es mover su objeto dentro de `TILE_GROUPS`, y
  nada más.** Todo lo que después retoca la grilla —administración,
  coordinación, el equipo docente— busca su grupo **por nombre**
  (`TILE_GROUPS.find((g) => g.title === …)`), nunca por la posición. Por eso
  `verificar-panel.js` también pregunta por nombre: con índices, un cambio de
  orden rompía media docena de comprobaciones que no tienen nada que ver con
  el orden y había que renumerarlas a mano. El orden se comprueba aparte y
  una sola vez, que es donde importa.
- **"Sesión en vivo" va sola y de primera**, en su propio grupo ("Clase en
  vivo") y con `destacado: true`, que la pinta ancha y en una línea. Es lo único
  del panel que pasa AHORA MISMO; mezclada entre Juegos y Torneos había que
  buscarla justo cuando hay clase. Un grupo de un solo acceso pintado con la
  grilla de cuatro columnas sería un cuadrito perdido a la izquierda, que es
  peor que no destacarlo.
- **Los grupos se ordenan por las preguntas que uno se hace al entrar**, igual
  que las pestañas de la clase en vivo: qué pasa AHORA (Clase en vivo) → qué me
  pusieron con fecha → qué hago por mi cuenta (Aprender) → dónde juego → dónde
  me mido → mi cuenta.
- **"Lo que te pone tu profesor" junta Tareas y Exámenes**, y es lo segundo que
  se ve. Antes Tareas vivía en "Aprender" y Exámenes en "Evaluaciones": lo
  único del panel que **tiene fecha** estaba partido en dos grupos y cada mitad
  enterrada entre cosas que se hacen cuando uno quiere. La franja de arriba
  solo aparece cuando hay tareas pendientes —y **nunca por un examen**—, así
  que fuera de ese momento no había dónde mirar.
  - **El rótulo no repite los nombres de sus dos tarjetas**: dice lo que las
    dos tienen en común y que no se deduce de ellas —que te las pone alguien
    más y vencen—. Es la misma regla que en la clase en vivo, donde el rótulo
    dice QUIÉN LO VE en vez de qué hace el botón.
  - Por eso el grupo lleva **`titleProfe`**, igual que los tiles llevan
    `descProfe`: del otro lado del escritorio esa misma pareja es "Lo que le
    pones a tus alumnos". Lo aplica `textosDelEquipoDocente()`, en el mismo
    lugar y de la misma forma que las descripciones. **Olvidárselo a un grupo
    nuevo le pondría a la profesora un encabezado que habla de su profesor**,
    así que la regla de "a quien da clase ninguna tarjeta le habla de «tu
    profesor»" vale ahora también para los rótulos, y la prueba los mira.
- **Al alumno, el entrenamiento se le abre en el panel mismo** (ver «El
  alumno ve el entrenamiento abierto», abajo). A quien da clase, "Aprender"
  sigue siendo Entrenamiento, Estudio, Cursos y Artículos. En
  "Jugar y competir" va primero donde se juega contra otra persona (Juegos, y
  Competir, que es retar a quien está en línea y las listas de partidas; ver
  «Competir: retar y las listas de partidas tienen su propia página» en
  `juegos-y-torneos.md`) y al final el bot. Torneos y TV en vivo ya no tienen
  tarjeta: se entra a los dos desde Competir.
- **El alumno ve el entrenamiento abierto.** Lo pidió así el dueño de la
  Academia: con dos tarjetas genéricas (Entrenamiento y Estudio), el alumno
  tenía que entrar para saber qué había adentro. Ahora, después de "Lo que te
  pone tu profesor", van seis grupos:
  - **Aprender**: las cinco categorías de fichas de Estudio (Fichas de
    aperturas, Defensas, Táctica, Conceptos, Finales), Lecciones, Desafíos y Artículos.
  - **Estudiar**: Cursos y Repasar mis clases, lo que se estudia con el profe.
  - **Entrenamiento básico / intermedio / avanzado**: las páginas del hub,
    por escalón.
  - **Mejorar por habilidades**: UNA tarjeta, «Habilidades», que abre
    `entreno/tipos.html` con los diecinueve tipos adentro. Estuvieron un día
    cada uno con su tarjeta y el panel se alargaba el doble: en el celular
    había que bajar un buen rato para llegar a «Jugar y competir».

  **Los nombres no se confunden con sus vecinas.** «Aperturas» a secas se leía
  igual que «Aperturas y celadas» (una se lee, la otra se practica), y «Aprende»
  dentro del grupo «Aprender» no decía qué era: por eso «Fichas de aperturas» y
  «Lecciones».

  Cada ficha de Estudio abre **solo su categoría** con `?cat=<id>`
  (`js/entreno-estudio.js`), con "Ver todas las fichas" para soltarla; una
  categoría que no existe cae a todas. Las tarjetas nuevas son `soloAlumno`:
  el panel docente (`PANEL_DOCENTE`) entra todavía por las dos puertas de
  siempre, que están en la lista con `soloDocente` y al alumno se le QUITAN
  (`ordenarPanelDocente()`), no se esconden. El hub `entreno/index.html` sigue
  existiendo, pero **solo como la puerta de quien da clase o administra**: su
  panel entra a todo el entrenamiento con una tarjeta, y meterle las trece
  sueltas lo alargaría otra vez. Las migas de cada página de entrenamiento ya
  **no** pasan por el hub (`Panel › Mates`, no `Panel › Entrenamiento ›
  Mates`): el alumno entra a cada una desde su tarjeta del panel, y la miga del
  medio lo mandaba a un segundo menú que nunca había visto, con las mismas
  tarjetas en otro orden. Por lo mismo, «Por dónde empezar» sin ningún hueco en
  el diagnóstico lleva a Practicar y no al hub, y el «Volver» del resultado de
  Precisión posicional vuelve al panel.
- **«Hoy te toca», también en el panel.** Vivía solo arriba del hub de
  Entrenamiento: la meta del día, los repasos que vencieron, lo que quedó a
  medias. Desde que el panel abre el entrenamiento tarjeta por tarjeta, el
  alumno ya no pasa por el hub y eso se quedaba sin nadie que lo viera. Ahora
  es UN módulo, `js/hoy-te-toca.js` (lógica y marcado), que pintan los dos: el
  hub con direcciones relativas a `entreno/` y el panel desde la raíz.
  - En el panel va **después de la franja y de «Continúa donde ibas»**: una
    fecha le gana a un repaso.
  - **No repite lo que ya dice la franja** (`enPanel: true`): ni la semana del
    plan ni «hacer el diagnóstico», que ya ofrecen «Por dónde empezar» y la
    tarjeta del diagnóstico. «Repetir el diagnóstico» a las cuatro semanas sí
    va: eso no lo dice nadie más.
  - Sus scripts se piden recién al pintar el panel del alumno
    (`cargarHoyTeToca()`), en orden, y antes de contar se espera
    `ProgresoUsuario.init()`, igual que en el hub: sin eso, lo entrenado en el
    celular no se vería en la computadora. La racha es la misma promesa que
    usa el saludo, no una segunda consulta.
  - Solo al alumnado: a quien da clase no se le pinta ni se le arma.
    `verificar-panel.js` («Hoy te toca», en el panel del alumno) lo revisa.
  - **Sin nada pendiente, una sugerencia**, solo en el panel, y dicha como
    sugerencia —no venció ni la pidió nadie—:
    1. **del diagnóstico**, si lo hizo: lo flojo, con dónde practicarlo
       («💡 Sugerencia de hoy, por tu diagnóstico en mates y seguridad del
       rey: Mates en 1»). La cuenta es `PlanEntrenamiento.paraPracticar()`,
       LA MISMA de la franja «Por dónde empezar» (que toma la primera): por
       cada área por debajo del 60 %, el primer recurso cuya página cuenta.
       Con varias áreas flojas, una por día de Costa Rica.
    2. sin diagnóstico (o sin nada flojo), una página de entrenamiento cuyo
       trabajo CUENTA (las que en `js/material-plataforma.js` ofrecen la meta
       `cantidad`), una por día.

    A quien todavía no hizo ni un ejercicio no se le sugiere nada: la franja
    ya le dice por dónde empezar, y el mismo destino dos veces en el panel
    hace pensar que son dos cosas. En el hub no hay sugerencia: ahí las
    páginas están justo debajo, y sin nada pendiente el bloque trae solo la
    meta del día.
- **Hoy te toca y tu progreso, en una sola tarjeta.** Eran dos tarjetas
  seguidas, y la racha de días salía en las dos (en la meta del día y en «Tu
  progreso»). Ahora `#progreso-alumno` es UNA tarjeta: «Hoy te toca» arriba
  (meta, racha, la semana, lo que toca), debajo los tres totales de siempre
  (ejercicios 4×4, lecciones, la mejor marca de Coordenadas, contados en la
  base por `mi_entreno_resumen()`) y al pie el récord de racha táctica. La
  racha de días va UNA vez, en la meta. Los totales se quitaron un día y
  volvieron a pedido del dueño de la Academia: al alumno le sirven.
- **El saludo es «¡Hola, Ana!»** —el nombre de pila y sin género: decía
  «¡Bienvenido, Ana Rojas!», que a una alumna le habla en masculino—, y al
  alumno el subtítulo le dice su racha («Llevas 4 días seguidos entrenando:
  hoy te faltan 3 ejercicios para no cortarla»), con la misma cuenta que
  Logros. El buscador le sugiere cosas que tiene («Mates, tareas,
  aperturas…»): decía «Cobros», que el alumno no tiene.
- **El alumno no tiene registro de clases.** Veía, al final de todo, la lista
  de clases de su profe; lo suyo es «Repasar mis clases». Ni se le pinta ni
  se le pide a la base.
- **«Lo último que hiciste».** Con treinta tarjetas, volver a lo que uno
  estaba haciendo era buscarlo. Se pide UNA fila de `training_progress` (la
  más reciente, la suya) y la tarjeta de esa página lo lleva escrito; si su
  grupo está plegado, el título lo dice. Qué página es cada actividad sale de
  `MaterialPlataforma.HERRAMIENTAS` (`actividades`), la tabla de Tareas: no
  hay otra lista que se pueda separar. Es la única lectura de esa tabla en el
  panel, y la prueba exige `limit(1)`: sumar ahí vuelve a chocar con el corte
  de PostgREST.
- **Sin clase, la clase en vivo ocupa una línea.** «Sesión en vivo» y
  «Videollamada» con candado ocupaban casi una pantalla del celular la mayor
  parte del día. No se esconden del todo —el alumno tiene que saber que
  existen antes de necesitarlas (ver «La videollamada de la clase»)—: quedan
  en UNA línea («🔒 Sesión en vivo y videollamada: Se abre cuando tu profe
  empiece la clase») que se alcanza con Tab y se anuncia como enlace no
  disponible. Cuando el profe abre la clase, Realtime repinta y vuelven las
  dos tarjetas grandes, solas (`claseCompacta()`). A quien da clase no le
  toca.
- **La tarjeta del diagnóstico, solo cuando hace falta.** Si lo hizo hace
  menos de cuatro semanas y nadie se lo pidió, no está: no hay nada que hacer
  ahí y el resultado está en Informes. A las cuatro semanas vuelve con «Toca
  repetirlo»; si el profe lo pide, se ve iluminada; si nunca lo hizo, como
  siempre. Si la base no contesta, se queda: callar es mejor que esconder algo
  que hacía falta. La consulta del diagnóstico propio es UNA (`miDiagnostico()`)
  y la comparten esta tarjeta y la franja «Por dónde empezar».
- **La próxima medalla, en «Hoy te toca».** De las que ya empezó y no tiene,
  la más cerca en proporción: «🎯 Te falta 1 para la medalla «Todoterreno»».
  Sale de `Logros.cargar()`, sin consultas nuevas. Sin ninguna empezada no se
  dice nada.
- **La franja dice cuánto lleva de cada tarea** (tres como mucho): «Mates en
  dos · 4 de 10», con su barra. Sale de los renglones de
  `tareas_con_avance()` (`hecho` contra `meta_cantidad`); con varios
  renglones, cuántos cumplió. La barra es adorno (`aria-hidden`): el número va
  escrito.
- **Tus clases, en un bloque que se pliega.** «Tu última clase» y «Tus puntos
  del mes» van juntos en un `<details>` que en el celular arranca cerrado y en
  la computadora abierto (se recuerda como los grupos). Sin ninguna de las dos
  cosas no se pinta.
- **El panel no espera a «Hoy te toca».** Sus diez scripts (~200 KB) se bajaban
  uno detrás de otro y el panel esperaba por ellos hasta el tope de 6 s: con
  una red lenta (3G simulada) el panel aparecía a los ~16 s. Ahora se bajan a
  la vez y corren en orden (`async = false`), y el panel no los espera: se
  pintan cuando llegan. Medido igual: el panel aparece a los ~9,9 s (lo que
  queda es la carga de la propia página). Lo mismo «lo último que hiciste».
- **Tu próxima clase.** La línea de la clase en vivo decía «Se abre cuando tu
  profe empiece la clase», pero no cuándo. Si el profe tiene puesto su horario
  (asistencia.html → «Tu horario»), ahora dice «Tu próxima clase («Finales»)
  es mañana a las 4:00 p. m., presencial», y a la hora de la clase, «es ahora,
  hasta las…». El horario del profe **no se le abre al alumno** (vería los de
  todos sus grupos): `mi_proxima_clase()`, SECURITY DEFINER, le contesta solo
  la SUYA con la misma regla con que se pasa lista (`alumnosDelHorario`): la
  de su subgrupo o la de un grupo igual al suyo (sin tildes ni mayúsculas), de
  uno de SUS profesores (`interno.profesores_de`). Una clase sin grupo ni
  subgrupo no es de nadie en particular y no cuenta. Cuándo tocaba lo cuenta
  `ocurrencias_horario()`, la misma del informe. Comprobado en SQL
  (revertido): cada alumno ve la de su grupo aunque esté escrito «adapz» o
  «Cénfo», otro alumno no ve ninguna, el alumno sigue sin leer
  `horario_clases` (0 filas) y `anon` no la puede llamar.
- **Lo que más usas y cuánto llevas.** Con los grupos plegados, llegar a Mates
  en el celular era abrir un grupo primero. Arriba de la grilla van las cuatro
  tarjetas donde más tiempo pasó en 30 días (con menos de dos no se pinta; el
  diagnóstico y Logros no son costumbre y no entran), y cada tarjeta de la
  grilla dice cuánto lleva desde siempre: «Llevas 120 mates», con la unidad de
  Informes (`TiempoSecciones.SECCIONES`), o el tiempo si esa sección no cuenta
  ejercicios. Todo sale de `tiempo_por_seccion()`, la cuenta de Informes
  (SECURITY INVOKER: la RLS le da solo lo suyo); dos llamadas, desde siempre y
  30 días, de ~20 ms con el alumno de más filas. Los cursos no dicen cuánto:
  eso lo dice «Sigue con tu curso». Mientras se busca, «Lo que más usas» se
  hace a un lado como el resto de lo que no es la grilla.
- **Competir avisa lo que lo espera.** Un reto de alguien en línea o un torneo
  de su profe no se veían hasta entrar a Competir. La tarjeta dice «Te
  retaron: 1 reto sin contestar» (y se ilumina) con los retos de los últimos
  dos días —un reto no vence solo y uno de la semana pasada ya no espera a
  nadie; los viejos siguen en Competir—, «Juegas «X»: va en curso» si está
  inscrito en un torneo en curso e «Inscripción abierta: «X»» si hay uno de
  las últimas dos semanas en el que no se inscribió. Los retos se cuentan con
  `head` (sin traer filas); lo que ve lo decide la RLS de siempre
  (`desafios_select`, `tournaments_select`: los torneos de SUS profes).
- **El final del panel, en tarjetas chicas.** «Tu cuenta» (Configuración,
  Informes, Logros, justificar una ausencia y la encuesta) no se usa todos los
  días y eran tres filas de tarjetas grandes al final. Al alumno le van en
  tarjetas chicas (`compacto`), de a dos por fila en el celular y sin la
  descripción —el nombre ya dice a dónde lleva—, que vuelve desde la tableta.
  «Herramientas» no se juntó: su única tarjeta (Archivos) está en
  mantenimiento para el alumnado, así que el grupo ni se pinta, y metida en
  «Tu cuenta» sería un cuadro gris para siempre. A quien da clase no le toca.
- **La marca «Nuevo».** Un artículo, un curso, una lección de Aprender o una
  ficha de Estudio nuevos no se enteraba nadie. `data/contenido-panel.json`
  dice qué hay detrás de cada una de esas siete tarjetas —los
  IDENTIFICADORES, no una cuenta: quitar una ficha y agregar otra el mismo día
  no movería la cuenta— y este aparato recuerda qué había la última vez
  (`panel_contenido_visto_v1`): lo que no estaba lleva «Nuevo» (o «Nuevo
  (3)») hasta que abre la tarjeta. La primera vez no marca nada: todo sería
  nuevo, que es lo mismo que nada. Es una comodidad de este aparato: en otro
  celular arranca de cero. El JSON **no se escribe a mano**: lo arma
  `herramientas/contenido-panel.js` de los mismos archivos que pintan cada
  página, y `verificar-contenido-panel.js` falla si alguien agrega contenido
  y no lo vuelve a armar.
- **El aviso del profe.** El profe no tenía cómo decirle algo a todo su grupo
  («Mañana no hay clase»). Ahora lo escribe en su panel (caja «📣 Aviso a tus
  alumnos»: para todos, un grupo o uno de sus subgrupos) y al alumno le sale
  **en una ventana que no puede saltarse**, en la página de la Academia que
  abra, hasta apretar «Marcar como leído» —así lo pidió el dueño de la
  Academia—. El profe ve «8 de 12 lo leyeron» y, con «Ver quiénes», la lista
  con la hora de cada uno.
  - **La base.** `avisos_profesor` (qué dijo, para quién) y
    `aviso_destinatarios` (una fila por alumno, con `leido_at`). Los
    destinatarios se fijan **al mandarlo**: el que entra al grupo después no
    sale como que no lo leyó. No hay políticas de escritura: manda
    `enviar_aviso()` (SECURITY DEFINER; arma la lista con
    `interno.alumnos_de()`, un subgrupo tiene que ser SUYO; tope de 10 por
    hora), marca `marcar_aviso_leido()` (solo la fila propia y solo la primera
    vez: la hora no se reescribe), y leen `mis_avisos_sin_leer()`,
    `mis_avisos_enviados()` (INVOKER) y `lectores_de_aviso()` (solo de un
    aviso propio). Las dos políticas de lectura se necesitan una a la otra y
    con subconsultas directas la base corta con «infinite recursion»: arman el
    conjunto `interno.avisos_que_recibi()` / `interno.avisos_que_mande()`.
    También sale por push al celular (`avisar_push`); si eso falla, el aviso
    queda igual.
  - **La ventana** (`js/aviso-profe.js`, la pone `academia-cabecera.py` en
    toda página de la Academia menos `examen.html`): un `<dialog>` con
    `showModal()` —lo de afuera queda inerte y el foco encerrado—, Escape no
    la cierra, el texto va por `textContent`, y si hay varios van uno detrás
    del otro, el más viejo primero. Si la base no contesta al marcarlo, se
    cierra igual (nadie queda encerrado por un corte de red) y vuelve la
    próxima vez. También mira al volver a la pestaña.
  - Comprobado en SQL (revertido): el aviso al grupo le llega a los del grupo
    y no a los del otro; el del subgrupo, solo al subgrupo; el alumno ve solo
    lo suyo, no puede insertar ni actualizar filas ni mandar avisos; marcar dos
    veces no cambia la hora; otro profe no ve el aviso ni sus lectores y no
    puede usar un subgrupo ajeno; `anon` no llama nada. `verificar-aviso-profe.js`.
- **Entrenar 10 minutos.** Un botón en «Hoy te toca» arma una tanda con las
  tres primeras cosas de hoy (o Mates, si hoy no toca nada en particular) y
  cuenta 10 minutos; una barra abajo (`js/tanda-diez.js`, en toda página de la
  Academia menos el examen) dice cuánto queda, en qué paso va y lleva al
  siguiente. El reloj no se anuncia cada segundo: se anuncian el paso y el
  final. Es de este aparato (`tanda_diez_v1`): una tanda es de un rato.
- **Tus favoritas.** Hasta ocho tarjetas fijadas arriba, elegidas en una
  ventana con casillas por grupo (una estrella dentro de cada tarjeta sería un
  botón dentro de un enlace). Viajan con la cuenta: `panel_favoritas_v1` está
  en la lista de `js/progreso-usuario.js` —la única clave de esa lista que no
  es progreso, a propósito: el alumno las elige una vez y las quiere en el
  celular y en la computadora—. Lo que es favorita no se repite en «Lo que más
  usas».
- **La semana en barras.** Debajo de «Esta semana: 30 ejercicios», siete
  barras con el número escrito debajo y el día («hoy» en la última). Salen de
  la misma `entreno_mi_semana()`, que ahora trae también `dias` (siete números,
  la misma cuenta y los mismos días de Costa Rica, así que la gráfica y el
  texto no pueden decir cosas distintas). La barra es adorno; el dato es el
  número, y el lector de pantalla dice el día completo. Sale también en el hub.
- **La campana del alumno.** «🔔 Novedades · 3 nuevas» junto al saludo abre
  «Lo último que te pasó»: tareas y exámenes nuevos, retos, avisos del profe y
  las notas que el profe le compartió —lo que le llega como push y, si lo
  perdía, no quedaba en ninguna parte—. Cinco de cada cosa y del último mes,
  lo que la RLS ya le deja leer, sin nada que guardar aparte. «Nuevo» es lo
  llegado desde la última vez que la abrió en este aparato
  (`panel_campana_vista_v1`); la primera vez, lo de la última semana.
- **El panel del profe, con la misma mano.** Sus grupos se pliegan en el
  celular como los del alumno (menos la clase en vivo y «Tu cuenta», que va en
  tarjetas chicas), y arriba sale «Lo que más usas»: como lo que hace quien da
  clase no se mide por sección, se cuentan sus toques en las tarjetas de este
  aparato (`panel_usos_v1`, desde tres).
- **El registro de clases no ensancha la página en el celular.** La tabla ya
  iba en una caja que se desliza (`overflow-x-auto`), pero el panel del profe
  medía 494 px en un celular de 390: el «Acciones» solo para lector de
  pantalla (`sr-only`, que es `position: absolute`) no tenía un ancestro
  posicionado dentro de esa caja, así que se salía del desplazamiento y
  empujaba la página entera. La caja lleva `relative`. `verificar-panel.js`
  mide que la página no pase del ancho del celular.
- **Los grupos de entrenamiento se pliegan en el celular.** Con el
  entrenamiento abierto tarjeta por tarjeta, el panel del alumno medía en el
  celular unas nueve pantallas (7100 px) y «Jugar y competir» quedaba a casi
  5000 px. Los seis grupos de entrenamiento (`plegable`) llevan el título
  como botón con `aria-expanded` —dentro del `<h2>`, que se sigue pudiendo
  saltar con lector de pantalla— y al lado cuántos accesos tiene. En el
  celular (hasta 639 px) arrancan cerrados; en la computadora, abiertos. Lo
  que cada quien abre o cierra se recuerda en este aparato
  (`panel_grupos_abiertos_v1`). Mientras se busca se abren solos: un
  resultado en un grupo cerrado no se vería. La grilla se esconde con
  `style.display`, no con `hidden`: la clase `grid` de Tailwind le gana a ese
  atributo. Al panel docente no le toca: sus grupos son otros.
- **"Logros" está en "Tu cuenta"**, que va en este orden: Configuración,
  Informes, Logros y, solo al alumnado, "¿Cómo van tus clases?". Lo pidió así
  el dueño de la Academia. "TV en vivo" estuvo ahí un tiempo y pasó a Competir,
  junto a los torneos. A quien administra se le deja en «Revisar el contenido».
- **Un mismo destino no va dos veces en el panel.** "Racha táctica" salió de
  "Jugar y competir" porque ya es lo PRIMERO que hay dentro de `juegos.html`,
  en una franja a todo el ancho: el segundo camino no se usa y de paso ensancha
  la grilla. Es el mismo error que el panel ya había cometido con "Torneos", y
  por eso mismo **"Torneos de la Academia" volvió a llamarse "Torneos"**: el
  nombre estaba largo para distinguirlo de la otra tarjeta que se llamaba
  igual, y esa otra es hoy "TV en vivo". El día que vuelva a haber dos, el que
  se renombra es el nuevo.
- **"Mide tu nivel" ya no existe.** Se llamaba "Evaluaciones" con los
  exámenes adentro, y después quedó con los dos diagnósticos y SOLO para
  administración (ver abajo). Hoy el de nivel vive en **"Lo que te pone tu
  profesor"**, ver «El diagnóstico de nivel es de lo que te pone tu profesor».
- **Un grupo del que no queda ni un acceso utilizable no se pinta.** A la
  alumna, "Herramientas" le salía como un encabezado y dos cuadros grises —sus
  dos accesos están en mantenimiento—: una sección entera de la página que no
  lleva a ninguna parte, que es la misma razón por la que se fue el
  "Próximamente" sin fecha. Un acceso apagado **entre otros que funcionan sí se
  queda**, y con su razón escrita: ahí uno vino por otra cosa y de paso se
  entera de que eso vuelve. No se esconde con una clase: no se pinta — un
  enlace invisible pero presente sigue siendo una parada de tabulador.
- **El diagnóstico de nivel es de lo que te pone tu profesor.** Durante un
  tiempo los dos diagnósticos fueron SOLO de administración —«un diagnóstico se
  APLICA, no se practica»—, y el alumno solo llegaba al de nivel por el primer
  paso de la franja de arriba, que se apaga en cuanto lo rinde. Justamente
  porque se aplica, su lugar es al lado de Tareas y Exámenes: te lo pide otra
  persona para ubicarte, y lo que sale de ahí es el plan que te arma.
  - **Al alumno** la tarjeta lo lleva a `entreno/diagnostico.html`, que de por
    sí está abierta al público sin cuenta: no se regala nada que no estuviera.
  - **A quien da clase** la misma tarjeta lo lleva al **resultado** de sus
    alumnos (`informes.html?tema=diagnostico`), no a la prueba: el banco es el
    mismo que el de ellos y resolverla por su cuenta no le sirve. Lo hace
    `hrefProfe`, que `textosDelEquipoDocente()` aplica igual que `descProfe`.
  - **El de arbitraje sigue siendo SOLO de administración**: está en su panel
    («Resultados de las pruebas») y en ningún otro. `nivel-de-arbitraje.html`
    sigue pública y enlazada desde la portada, que es otra cosa.
  - `verificar-panel.js` pide que al alumnado el diagnóstico le salga **una
    sola vez** (en ese grupo), que a la profesora la tarjeta vaya al informe y
    que en la grilla de ninguno de los dos quede ni un enlace a
    `arbitraje` —ni escondido: un enlace invisible pero presente sigue siendo
    una parada de tabulador—.
- **La tarjeta del diagnóstico se ilumina cuando el profe lo pide.** El
  profe lo asigna como un renglón de una tarea (ver «El diagnóstico de nivel se
  pide como tarea, y solo cuenta el nuevo»). Mientras ese renglón no esté
  cumplido y la tarea esté pendiente o vencida (una programada todavía no se
  le muestra), `marcarDiagnosticoPedido()`:
  - le pone a la tarjeta el anillo de «Sesión en vivo», un **punto que late**
    en la esquina y la etiqueta **«Te lo pidió tu profe · vence mañana»** (o
    «se pasó la fecha»). El punto es adorno (`aria-hidden`) y se queda quieto
    con «reducir movimiento» (`motion-reduce:animate-none`): lo que importa va
    escrito. La etiqueta usa el mismo par de colores que la llamada a la
    acción de la franja, sobre el mismo fondo de tarjeta;
  - cambia el enlace a `entreno/diagnostico.html?tarea=<id>`, así adentro sale
    la franja de la tarea;
  - si esa tarea es la más próxima y no hay nada urgente, la franja de arriba
    dice «Tu profe te pidió el diagnóstico de nivel» y lleva directo a la
    prueba.
  - **Se repinta SOLO esa tarjeta**, no la grilla: repintarla cerraría lo que
    estuviera abierto debajo. Y lo cumplido no se recalcula acá: sale de
    `tareas_con_avance()`, así que al rendirlo se apaga solo.
  - `verificar-panel.js` lo mira con los cinco casos (pendiente, «reducir
    movimiento», vencida, ya rendido y sin pedido), midiendo lo que se ve: la
    sombra contra la de Tareas, `checkVisibility()` de la etiqueta y el
    `animationName` del punto.
- **Un acceso apagado no es un enlace gris.** `renderTileCard()` le pone un
  `<div>` con `aria-disabled`, sin `href`: no promete un destino que no va a
  abrir. **Pero SÍ recibe el foco** (`tabindex="0"`, `role="link"`), y eso se
  cambió a propósito: antes no lo recibía, y quien usa lector de pantalla y se
  mueve con Tab se saltaba entera la tarjeta de «Sesión en vivo» bloqueada —o
  sea que no se enteraba de que existe ni de por qué está cerrada—. Así se
  anuncia como «enlace, no disponible» y se lee su razón. Lo que sigue sin
  poder existir es un `<a href>` escondido: ese sí promete un destino. Y lleva escrito POR QUÉ está apagado
  ("En mantenimiento", "Próximamente") en la propia tarjeta — un cuadro gris sin
  explicación se lee como una página rota.
- **Cada tarjeta lleva el texto de los dos públicos: `desc` y `descProfe`.**
  El panel estaba escrito para el alumno de punta a punta, así que a quien da
  clase le decía cosas que no son: que "tu profesor te asigna el rival" (lo
  asigna ella), que los torneos "los arma tu profesor" (los arma ella), que
  Informes es "tu progreso" (es el de sus alumnos) o que la sesión en vivo es
  "el tablero con tu profesor". **Tareas tenía el defecto al revés**: su texto
  era el del profesor, así que al alumno le ofrecía asignarle material a unos
  alumnos que no tiene.
  - Los dos textos viven **junto al tile** y no repartidos en `if`s por
    `init()`: así se ven de un vistazo al leer la lista, y un tile nuevo que
    solo sirva para uno de los dos se nota enseguida. Lo aplica
    `textosDelEquipoDocente()` sobre la lista ya armada, en un solo lugar,
    igual que `apagarEnMantenimiento()` — y vale para quien administra, como
    todo lo que se hace para los profesores.
  - **Un texto que sirve igual para los dos NO se duplica.** Dos versiones de
    la misma frase se van separando a la primera corrección; sin `descProfe`,
    el tile usa el suyo y ya.
  - **La comprobación que importa no es la lista de textos uno por uno**, que
    envejece con cada corrección: es que a quien da clase **ninguna** tarjeta
    le hable de "tu profesor". Un tile nuevo copiado de otro cae ahí solo.
- **"Mis pagos" es del alumnado, no del equipo docente.** Las mensualidades
  son de las familias, así que a una profesora esa tarjeta le ofrecía "lo que
  se te ha cobrado" sobre una cuenta a la que no se le cobra nada. Quien
  coordina sí llega a los cobros, pero por **"Cobros de la Academia"** en
  Herramientas, que es la página entera y no el recibo propio — y por eso
  nunca aparecen las dos, que serían el mismo destino repetido.
- **En el grid van LUGARES, no acciones.** "Cerrar sesión" estaba ahí *y*
  como botón de la cabecera: el mismo destino dos veces —lo que ya había
  pasado con "Torneos"— y la única acción entre un grid de sitios a los que
  ir. Se queda solo en la cabecera, que es donde se busca. Con él se fue el
  camino `action === "logout"` de `renderTileCard()`, que no usaba nadie más.
- **Un "Próximamente" sin fecha no se queda.** "Exámenes" llevaba meses
  apagado esperando unos exámenes de curso que todavía no existen, ocupando
  un lugar de la grilla. Una tarjeta que nunca cambia deja de leerse; el día
  que los exámenes existan, vuelve. No es lo mismo que "En mantenimiento",
  que sí dice algo cierto sobre un acceso que existe y va a volver.
- **Lo de mantenimiento se apaga SOLO para el alumnado**, en
  `apagarEnMantenimiento()`, sobre la lista ya armada y en un solo lugar. Se
  marca con `mantenimientoAlumno: true` en el tile, así que volver a prender un
  acceso es borrar esa palabra. Como todo filtro del sitio esto decide qué se
  PINTA: la dirección sigue existiendo y quien la conozca entra igual.
- **Y `soloAdmin` no es lo mismo, aunque se parezca.** `mantenimientoAlumno`
  APAGA un acceso para el alumnado y se lo deja entero al equipo docente;
  `soloAdmin` lo QUITA para todos menos administración, en
  `soloParaAdministracion()` y con el mismo patrón de sus dos hermanas (sobre
  la lista ya armada, así alcanza también a los tiles que `init()` agrega
  después). **Confundirlos es lo que dejó al lector de planilla a la vista de
  la profesora**: la página todavía no funciona y ella la tenía como un acceso
  normal, o sea una promesa que se descubre rota delante de la clase. Hoy el
  lector de planilla y la "Guía del profesor" son los dos `soloAdmin`. Se
  quitan y no se apagan porque una tarjeta gris dice "esto vuelve", y acá lo
  que hay que decir es que no es suyo.
  - **Ya no existe.** Desde que quien administra tiene su propio panel
    (`ADMIN_GROUPS`, ver «El panel de quien administra no es el de un
    profesor»), lo que era `soloAdmin` —lector de planilla, tienda,
    actualizaciones, guía del profesor— y el grupo «Mide tu nivel» viven ahí.
    En el panel docente no hace falta quitarlos: no están. Lo que sea solo de
    administración se agrega a `ADMIN_GROUPS` y a nada más.

### Arriba va lo que vence, no otro directorio de lugares

El panel era una lista de sitios a los que ir: todo lo que es "esto te toca
AHORA" vivía detrás de un clic, y quien no lo buscaba no se enteraba. Dos
franjas, las dos arriba del grid y **antes** de los accesos:

- **Lo que te pusieron con fecha: tareas Y exámenes** (`#pendientes-aviso`, que
  por eso dejó de llamarse `tareas-aviso` — un examen contado dentro de algo
  que se llama "tareas" es como empiezan los malentendidos). La fecha límite ya
  vivía en `tareas.vence_at` y en `examenes.vence_at`; lo que faltaba era
  decirla acá. Un alumno abría el panel, no veía nada que hacer, y la entrega
  vencía **sin que nada avisara** — el aviso push sale al asignarla y después
  no vuelve nunca, y del examen ese push es el **único** aviso que existe.
  - **Ninguna de las dos cuentas se hace acá**: `tareas_con_avance()` es la
    misma función que pinta `tareas.html` y `examenes_con_nota()` la misma que
    pinta la lista del alumno en `examenes.html`. Dos pantallas que cuenten lo
    mismo por su cuenta terminan diciendo cosas distintas del mismo alumno.
  - **Un examen vencido NO es una tarea vencida, y confundirlos sería
    mentirle.** `iniciar_examen()` rechaza con «Se pasó la fecha para hacer
    este examen» el que sigue en `asignado` después de su `vence_at`: ahí se
    acabó. Una tarea vencida, en cambio, se sigue pudiendo hacer, y por eso su
    texto dice "todavía puedes" y el del examen **no**. Lo mismo el
    `congelado`, que solo reabre el profesor, y el `en_curso` al que ya se le
    pasó el `termina_at`. De los cuatro estados, solo **asignado con fecha por
    delante** y **en curso con reloj corriendo** son "puedes hacer algo ahora":
    lo decide `estadoDeExamen()`, en un solo lugar.
  - **Lo que ya no se puede hacer se dice pero no se cuenta.** Sumarlo al
    "tienes N pendientes" le ofrecería algo que no va a poder abrir; callarlo
    sería el fallo de siempre. El título pasa a "Hay algo que tienes que
    saber".
  - **El orden de las reglas importa y está escrito**, como el del informe a la
    casa: el texto se queda con UNA cosa, la que pide actuar antes — primero el
    examen con **el reloj corriendo** (que es lo más urgente que hay en el
    panel: el tiempo se está yendo ahora), después lo que ya se perdió, después
    la tarea vencida, y al final lo que viene, donde entre dos que vencen el
    mismo día manda el examen porque tiene una sola oportunidad.
  - **Los minutos que quedan NO se dicen acá.** El reloj del examen sale de la
    hora del **servidor** (`termina_at` contra `now()`) y en el panel solo está
    la del navegador: un número sacado del reloj de la computadora podría
    decirle que le quedan diez minutos cuando ya se le acabaron. Ese número lo
    da `examen.html`, que lo pide a la base. Decidir "corre o no corre" con el
    reloj local sí es tolerable — en el peor caso lo manda a la pantalla del
    examen, que le dice la verdad.
  - **El enlace lleva a lo que el texto acaba de nombrar**, y cuando es un
    examen rendible va **directo a rendirlo** (`examen.html?id=…`), la misma
    decisión que el aviso al celular: tiene reloj y una sola oportunidad, así
    que buscarlo en una lista es un paso de más. Uno vencido o congelado va a
    `examenes.html` — mandarlo a la pantalla que lo va a rechazar sería peor.
  - **Si los exámenes no llegan, las tareas se siguen mostrando**: quedarse sin
    franja por la mitad que falló sería perder también la que sí se pudo leer.
  - **Una tarea vencida pinta la franja en rojo**, con el emoji cambiado. Es la
    diferencia entre "tienes algo que hacer" y "se te pasó", y en el gris del
    resto del panel esas dos cosas se leen igual. El emoji acompaña a la
    **línea** y no a la franja: con el 📋 de Tareas sobre un texto que habla de
    un examen, el icono estaría señalando otra cosa.
  - **"vence mañana", no una fecha.** Una fecha hay que compararla con el
    almanaque; se cuenta por **días de calendario** y no por horas, así que una
    tarea de mañana a las 8 a. m. vence mañana aunque falten menos de 24 horas.
  - **Las pendientes las filtra la base** (`p_pendientes` de la función), no se
    bajan todas para descartar las hechas acá.
- **Continúa donde ibas.** El curso a medias cuya última lección marcada es la
  más reciente, con su barra. Los datos ya los cuenta
  `informes_cursos_alumnos()` (un renglón por alumno y curso empezado, con el
  total, lo hecho y el último tema): acá solo se elige cuál mostrar. Un curso
  terminado no se ofrece — no hay nada que continuar ahí.

**Las dos arrancan con `hidden` y solo se destapan cuando de verdad hay algo que
decir.** Una franja que diga "no tienes tareas" es ruido en todas las visitas
menos una, y un cartel que se repite deja de leerse — la misma lección que dejó
el aviso de instalar la app.

### Por dónde empezar: sin nada que vencer, la franja la ocupa el primer paso

Un alumno recién invitado no tiene ninguna tarea ni ningún examen —nadie se los
puso todavía—, así que la franja se le quedaba en blanco y el panel era un
directorio de veintitantos lugares sin ninguna pista de por cuál empezar. En los
datos se veía exactamente así: **de los alumnos que llegaron a entrar, la mayoría
no había resuelto ni un ejercicio**, y buena parte de ellos **sí había hecho el
diagnóstico** — o sea que no es que no arranquen, es que **el camino se corta
justo después**.

Lo confirma el otro número: `training_plans` tiene **cero filas** desde que
existe. El diagnóstico se rinde, da un resultado, y no hay nada que lo convierta
en «ahora haz esto».

**Por eso no es UN primer paso, es EL SIGUIENTE**, y son tres peldaños que se
calculan de lo que ya hay. El panel pinta el primero que no esté cumplido:

| si… | se le ofrece |
|---|---|
| ya rindió el diagnóstico y no ha resuelto nada | **su** área floja, con dónde practicarla |
| lo dejó a medias | seguir el diagnóstico, diciendo por qué pregunta iba |
| no lo empezó nunca | hacer el diagnóstico |

- **Se apaga solo.** Al resolver el primer ejercicio el peldaño deja de
  cumplirse. No hay nada que marcar ni ningún «ya lo vi» en `localStorage` que se
  pueda quedar desincronizado.
- **Va en la MISMA franja** (`#pendientes-aviso`), no en una nueva: contesta la
  misma pregunta —«¿qué hago ahora?»— y dos franjas peleando por el primer lugar
  es el problema que este panel ya tuvo con «Estado de la clase». Por eso el
  pintado se sacó a **`pintarFranja()`**: con dos, el que se olvidara de quitar
  el rojo dejaría una sugerencia con pinta de entrega vencida.
- **Lo que vence MANDA.** El primer paso solo llega hasta donde
  `cargarPendientes()` hoy se rendía sin pintar nada: una fecha le gana siempre a
  un consejo. Sin eso, a un alumno nuevo con una tarea ya puesta el panel le
  escondería la tarea detrás de la sugerencia.
- **Nunca se pinta en rojo** y tiene su propio título («Empieza por acá»): decir
  «tienes 1 pendiente» sobre una sugerencia sería mentir.

#### La semana del plan, para quien ya arrancó

Los tres peldaños se apagan con el primer ejercicio y ahí el panel se quedaba
callado, que en los datos es justo donde se corta el camino: de los alumnos que
hicieron el diagnóstico, un tercio no volvió a entrenar y otro tercio lo dejó a
los uno o dos días. Ahora, a quien ya arrancó y tiene un plan vigente, la misma
franja le dice **«Tu plan · semana 2 de 4»**, qué toca esa semana, cuánto lleva
ahí desde el diagnóstico y el botón a donde el trabajo cuenta.

- **No es un cartel que se repite igual**: cambia de semana en semana y el
  número sube con lo que hace. Se apaga solo cuando el plan termina.
- **Lo que vence sigue mandando**: esto vive dentro de `mostrarPrimerPaso()`,
  que solo corre cuando no hay tareas ni exámenes que pintar.
- La cuenta es `PlanEntrenamiento.hoyDelPlan()`, la misma de «Hoy te toca»,
  y respeta el plan que el profesor compartió (ver «La semana del plan, en el
  hub y en el panel» en entrenamiento.md). Nunca en rojo.

#### El destino tiene que ser una página cuyo trabajo CUENTE

Es lo único de todo esto que se rompe callado. **Cinco de las nueve áreas tienen
como primer recurso la PORTADA de un curso**, que es un temario: mandar ahí a
quien quiere *hacer* algo lo deja leyendo un índice, no escribe ni una fila en
`training_progress`, y **mañana la franja le dice exactamente lo mismo** — el
peldaño no se apaga nunca y no se entera nadie.

Así que el destino se cruza contra `MaterialPlataforma.HERRAMIENTAS` y solo vale
el que ofrece la meta `cantidad`, que es lo mismo que decir «escribe en
`training_progress`». Si el área más floja no tiene ninguno, **se baja a la
siguiente que sí lo tenga**.

- **Y por eso el texto NO dice «lo más flojo».** Se ofrece la más floja *de las
  que tienen dónde practicar*, que no siempre es la peor de todas; «señala un
  hueco en X» es cierto para cualquiera por debajo del 60 %, y el superlativo
  sería mentira.
- **Ni el área ni el enlace se escriben acá.** Las áreas flojas las calcula
  `PlanEntrenamiento.resumir()` —la misma que pinta Informes y el resultado del
  diagnóstico— y a dónde va cada una está en su propio `recursos`.
- **Se compara la PÁGINA, no la dirección entera** (`r.href.split("?")[0]`):
  los recursos del plan llevan su recorte puesto y el catálogo de Tareas guarda
  la página pelada. Comparando la dirección completa no coincidiría ni uno solo
  y el paso caería siempre al genérico, sin que nada fallara.
- **Y se manda la dirección CON el recorte.** Es lo que separa «haz ejercicios
  de clavada» de «ahí tienes ochenta temas, busca» — la misma decisión que el
  enlace de una tarea.

### Los recursos del plan: específicos, y comprobados contra el banco

`AREAS[].recursos` decía «Ejercicios por tema» y «Curso: Estrategia y Táctica»,
o sea el nombre de la página y nada más. Eso se escribió cuando el sitio tenía
mucho menos material; hoy hay **80 temas, 3 categorías de mates, 40 líneas de
apertura y 56 fichas de estudio**, todos con su enlace directo, y el plan no
conocía ninguno. Quien tenía flojos los finales recibía «Ejercicios por tema»
y ochenta temas por delante para encontrar los de final.

Ahora cada área ofrece **de 5 a 7 recursos con su recorte puesto**, y en un
orden que no es casual: **primero lo que se HACE** (ejercicios que cuentan),
después la ficha de Estudio para mirarlo de un vistazo, y al final el curso o el
artículo para leerlo a fondo. Son 57 enlaces, 35 de ellos recortados.

- **Las nueve áreas tienen ahora dónde practicar.** Antes, cinco mandaban a la
  portada de un curso y el primer paso del panel se las tenía que saltar;
  `finales` ya tiene `pawnEndgame` y `rookEndgame`, `estrategia` tiene
  `quietMove` y `middlegame`, y `maestria`, las partidas de maestros.
- **`entreno/aperturas.html` entró en «Principios de apertura»**, que era la
  única área cuyo plan no ofrecía ni un ejercicio que resolver.
- **El desequilibrio de material tiene su propio curso** y ahí se manda ahora
  «Valor del material», que apuntaba a Fundamentos.

**Al tocar `recursos`, los bancos o `js/material-plataforma.js`, correr `node
herramientas/verificar-plan-recursos.js`** (no necesita navegador, ni red, ni el
sitio servido). Comprueba que cada enlace exista como archivo, que cada recorte
esté **en el banco de verdad** —`entreno/data/metas.json`, el mismo que genera
`metas-indice.py` leyendo las fuentes—, que ninguna área repita un recurso, y
—lo que sostiene el primer paso del panel— **que ninguna se quede sin un solo
recurso donde el trabajo cuente**. Con qué parámetro recorta cada página se le
pregunta a su propio `hrefRecorte` y no a una tabla escrita en el verificador:
el día que cambie, una tabla copiada seguiría dando verde sobre enlaces rotos.

Todo lo que se rompe acá se rompe callado y lo descubre el alumno, que es el
único que no puede arreglarlo: un `?tema=` con una clave que ya no está abre la
lista vacía, sin error y sin aviso. Está probado que falla de verdad —con un
tema inventado y con un archivo renombrado, salta—.

#### Detalles que ya costaron una vez

- **Haber rendido el diagnóstico NO es haber entrenado.** Es una fila de
  `training_progress` como cualquier otra, así que «no ha hecho un solo
  ejercicio» **no** es `total_ejercicios === 0`: hay que descontarlo de
  `por_actividad`. Sin eso, a quien acaba de rendirlo el panel lo daría por
  arrancado y no le diría nunca qué hacer con el resultado — que es justo el caso
  que más abunda.
- **No se le promete que el diagnóstico se retoma donde lo dejó.** Una prueba
  empezada con una `VERSION` anterior se descarta a propósito, así que
  prometerlo sería mentirle justo a quien vuelve confiando en eso. Se dice por
  qué pregunta iba, y nada más.
- **`js/plan-entrenamiento.js` y `js/material-plataforma.js` se bajan cuando
  hacen falta**, no en cada carga: son 39 KB que solo usa quien ya tiene un
  diagnóstico rendido, y por el panel entra todo el mundo —incluidos los que
  todavía no lo hicieron, que son justamente los que más van a ver esta franja—.
  Mismo criterio que el libro de aperturas del bot.
- **`Logros.cargar()` se pide UNA vez y la promesa se reparte** entre el número
  de «Tu progreso» y el primer paso: dos llamadas serían dos veces la misma
  consulta para pintar el mismo dato.

### El orden de la página es el de las preguntas que uno se hace al entrar

    qué me toca  →  por dónde iba  →  cómo voy  →  y recién entonces a dónde ir

O sea: tareas, "Continúa donde ibas", "Tu progreso" y después el grid de
accesos. El resumen estaba **al final**, después de las seis secciones de
tarjetas: la racha y los números —que son lo que da ganas de volver— solo los
veía quien hacía scroll hasta el fondo.

- **La franja de "Estado de la clase" solo aparece cuando tiene algo que
  decir**: si hay clase en curso (eso lo ve todo el mundo) o si quien mira da
  clase y puede iniciar una. A un alumno fuera del horario —que es casi
  siempre— le ocupaba el **primer lugar de la página** para avisarle de que NO
  pasa nada, empujando hacia abajo sus tareas. El acceso a la sesión en vivo
  sigue estando en el grid, que es donde se busca.
  - **Se esconde la tarjeta entera** (`#session-status-card`), no solo sus dos
    mitades: con las dos ocultas quedaba la caja blanca vacía con su relleno,
    que se lee como algo que no cargó.
  - **La condición es la misma que ya decide el botón de iniciar clase**, así
    que no se le esconde a nadie un control que sí podría usar. Esconderla de
    más le quitaría a quien da clase la única forma de empezarla, y eso no
    daría ningún error: simplemente no podría.
- **El orden se comprueba con `compareDocumentPosition`**, no con el CSS: lo
  que importa es el orden del documento, que es también el que recorre un
  lector de pantalla.

### Los tres números de Entrenamiento los contaba el navegador

Es la misma piedra de `informes.html` y de `admin.html`, y estaba acá desde
siempre: "Tu progreso en Entrenamiento" hacía
`from("training_progress").select("*").eq("student_id", …)` y sumaba en el
navegador. **PostgREST corta la respuesta a partir de cierta cantidad de filas
sin dar ningún error**, y `training_progress` crece unas 5 filas por alumno y
por día: a un alumno con bastante entrenamiento encima el panel le pintaba un
número **que ya no subía**, sin que nada fallara.

Los tres números los cuenta la base. Primero se pidieron a
`informes_resumen_alumnos()`, pero eso resultó caro: ver «Con la base saturada,
el panel no se queda cargando», abajo. Hoy los da `mi_entreno_resumen()`.

De paso, **las tres tarjetas anchas apiladas** —récord de racha táctica, racha
de días y los tres números— quedaron en **una sola franja "Tu progreso"**, cada
número con su enlace. Eran mucho scroll para tres datos y para llegar al
registro de clases.

### Con la base saturada, el panel no se queda cargando

El 29 de septiembre, a las 6 p. m. (hora pico de clases), el panel se quedó en
«Cargando tu panel…» y no dejaba entrar. La página no tenía ningún error: la
base (entonces tamaño Nano) estaba saturada y cortaba por *statement timeout* hasta las
consultas mínimas. Dos cosas del panel lo empeoraban.

**1. El alumno pedía a `informes_resumen_alumnos()` tres números suyos.** Esa
función arma el renglón de cada alumno que la RLS deja ver —a un alumno,
también a sus compañeros—, con respuestas, asistencia y minutos
(`minutos_por_tramos`). Impersonando a un alumno en SQL en plena hora pico:
**7,3 s y 51 renglones para usar uno**. Ahora el panel llama a
`mi_entreno_resumen()` (migración `20260930001504`): solo esos tres números,
solo de una persona, **0,5 s en la misma hora**.

- **`SECURITY INVOKER`**: quién ve a quién lo sigue decidiendo la RLS de
  `training_progress`. Comprobado impersonando: el alumno recibe los mismos
  números que le daba la función de antes (209, 0, 6), y pidiendo los de otro
  alumno recibe ceros. `anon` no la puede ejecutar.
- **Son dos copias de las mismas tres cuentas**, y eso se separa callado: si
  Informes cambia cómo cuenta los puzzles, el panel seguiría mostrando un
  número creíble y distinto. `verificar-mi-entreno.js` exige que las tres
  expresiones estén, tal cual, en la última versión de las dos funciones. No
  se reescribió `informes_resumen_alumnos()` para que use la nueva: la usan
  también Informes, Cobros, Formularios y Subgrupos, y cambiarla en plena
  saturación era arriesgar todo eso por un panel.

**2. El panel esperaba cada consulta en fila, y a la última.** `init()` pedía el
estado de la clase, después el registro, después el resumen, y mostraba el
panel recién cuando terminaba todo. Con la base lenta se sumaban los cortes de
cada una: minutos de rueda girando. Y si algo lanzaba un error a mitad de la
carga (no un `{ error }`, un error de verdad), la promesa de `init()` se caía
sin que nadie la atajara y la rueda seguía **para siempre**.

- **Todo lo que no depende de lo otro va a la par, con tope**
  (`sinEsperarDeMas`, 6 s): el panel se muestra cuando llega todo o cuando pasa
  el tope, lo que ocurra primero. Lo que llega después se pinta igual en su
  lugar (cada parte escribe en su propio elemento), y lo que falla deja su
  guion. El tope vale para los cuatro caminos: alumno, docente, supervisión y
  administración.
- **`init().catch`**: si ya cargó el perfil, se muestra el panel con lo que haya;
  si no, se dice que no se pudo cargar. El error **se vuelve a lanzar** para
  que siga llegando a Sentry (`js/errores.js` escucha los rechazos sueltos):
  atajarlo en silencio lo habría escondido.
- **A los 15 s sin panel**, dentro de la misma región `role="status"` de la
  rueda, aparece «Está tardando más de lo normal…» con **Volver a intentar**.
  Antes la rueda sola no decía nada ni daba salida.
- Lo imprescindible sigue esperándose entero (la sesión, el perfil, las clases
  del alumno, «Ver como»): sin eso el panel pintaría otra cosa.

`verificar-panel.js` lo simula con consultas que **no contestan nunca** (peor
que lentas) y con una que **lanza**: el panel tiene que aparecer, y cuando ni
lo imprescindible contesta, el aviso con «Volver a intentar» tiene que verse.
Con el `clases.js` anterior esas pruebas fallan.

**Lo que no se arreglaba desde el código:** la base era Nano (0,5 GB,
procesador compartido) y en hora pico no le alcanzaba. Después de esto la base
**subió a tamaño Small** (plan Pro), con el doble de memoria y 90 conexiones.
Aun así, el consumo más grande, con mucha diferencia, sigue siendo el de
Realtime (`realtime.list_changes`): el 30 de setiembre de 2026, recién hecho
el cambio, era casi el 59 % del tiempo de la base, con 19 tablas publicadas. Una
base más grande da margen, pero no quita esa carga. Y el tope de 8 s de
`authenticated` **no se sube** por tener más base: es lo que avisa cuando una
consulta se vuelve mala.
Ver «La base saturada del 29/9: qué la cargaba y qué se hizo» en
`sitio-e-infraestructura.md`.

### Quien da clase no entra al panel del alumno

Al profesor el panel le mostraba **sus** ejercicios 4×4 (en cero, porque no es
alumno), **su** racha de días y el récord de racha táctica de la clase. Nada de
eso le sirve: lo que necesita al entrar es **a quién hay que perseguir**. Ahora
ve "Tu semana" — sus alumnos, cuántos no entrenaron en 7 días, las tareas que
ÉL mandó y siguen sin hacerse, cuántas ya vencieron y las clases del mes. Es la
misma decisión de "una página, dos públicos" que ya toman `informes.html`,
`cobros.html` y `tareas.html`, y **vale igual para quien administra**, como todo
lo que se hace para los profesores.

- **La cuenta la hace `public.panel_profesor()`**, no el navegador: contar
  "alumnos distintos que entrenaron" desde el cliente pide bajarse
  `training_progress` y cruzar el mismo techo de arriba en silencio.
- Es **`SECURITY INVOKER`**, como las funciones de informes: **quién es alumno
  de quién lo decide la RLS** y no hay un solo filtro de profesor escrito, ni en
  la función ni en la página. Comprobado impersonando roles en SQL — una
  profesora recibe exactamente sus 29 alumnos, los mismos que `alumnos_de()`, y
  quien administra los 89.
- **Las tareas sí llevan `profesor_id = auth.uid()` escrito dentro de la
  función**: la política de `tareas` deja ver también las de quien administra, y
  lo que el panel dice es "las tareas que TÚ mandaste", no las de toda la
  plataforma.
- **"Sin entrenar" es una resta** (`alumnos - activos_7d`), no un número aparte
  que pueda contradecir a los otros dos.
- **El rojo solo aparece cuando el número no es cero.** En rojo permanente se
  deja de ver, que es lo mismo que no ponerlo.
- **La situación de una tarea NO es su columna `estado`.** Esa columna quedó
  sin uso a propósito (ver «Tareas») y nunca vale `'vencida'`: la calcula
  `tareas_con_avance()` a partir de los renglones, que es la misma cuenta que
  pintan `tareas.html`, el panel del alumno y el informe a la casa.
  `panel_profesor()` la miraba igual, y medido con los datos reales eso eran
  **dos tareas que el alumno ya había terminado contadas como pendientes Y
  vencidas**: el único número que le pide al profesor hacer algo, inflado, y sin
  que nada fallara. Al escribir cualquier cuenta de tareas se usa
  `tareas_con_avance()`, nunca la columna.
- **`tareas_puestas` y `clases_dadas` no son `tareas_pendientes` ni
  `clases_30d`.** Existen porque los peldaños de abajo necesitan distinguir
  "nunca" de "ahora no": con todas las tareas hechas las pendientes son cero
  igual que si no hubiera puesto ninguna, y `clases_30d` en cero puede ser un
  mes flojo o una cuenta que nunca dio clase. Son dos situaciones que piden
  decirle cosas opuestas.

#### Por dónde empezar, del lado del que da clase

Es el mismo problema del alumno y la misma solución, con los peldaños del otro
lado del escritorio: un entrenador nuevo abre el panel, ve cuatro números en
cero y un directorio de accesos, y nada le dice cuál es el siguiente paso. En
los datos se veía igual — el profesor con más alumnos llevaba **49 entradas y
ni una tarea, ni una clase, ni un plan, ni una nota**.

`primerPasoDelProfesor()` pinta **el primer peldaño que no esté cumplido**, y
todos se calculan de lo que ya hay, así que **se apagan solos**: al mandar la
primera tarea ese peldaño deja de cumplirse. No hay nada que marcar ni ningún
"ya lo vi" en `localStorage` que se pueda quedar desincronizado.

| | cuándo | a dónde |
|---|---|---|
| 1 | sin alumnos asignados | a ninguna parte (ver abajo) |
| 2 | ninguno hizo el diagnóstico | Tareas |
| 3 | hay planes sin compartir | Informes |
| 4 | no ha puesto ninguna tarea | Tareas |
| 5 | no ha dado ninguna clase | la clase en vivo |
| 6 | faltan diagnósticos (goteo) | Tareas |

- **El orden es el del trabajo, y por eso se dice UNA sola cosa**: sin alumnos
  no hay nada que hacer; sin diagnóstico no hay plan que armar; un plan sin
  compartir no lo ve ni el alumno ni su casa, o sea que cuenta como que no
  existe; y recién entonces la tarea y la clase.
- **El peldaño 1 no lleva a ninguna parte, y es a propósito.** Asignar alumnos
  es de quien administra, así que a un profesor se le explica **que no está
  roto** —eso es justo lo que parecen cuatro ceros con Informes vacío, Tareas
  sin a quién mandarle y un subgrupo que no se puede llenar— y se le dice quién
  se los asigna. Se le **quita el `href`** al `<a>`, no se le deja uno que no
  haga nada: sin `href` no recibe el foco ni se anuncia como enlace. A quien
  administra sí se le ofrece `admin.html`, que es suyo. Tres de los siete del
  equipo docente estaban en ese estado.
- **Va en la MISMA franja que lo del alumno** (`#pendientes-aviso`, por
  `pintarFranja()`): contesta la misma pregunta —«¿qué hago ahora?»— y dos
  franjas peleando por el primer lugar es el problema que este panel ya tuvo
  con «Estado de la clase».
- **Nunca en rojo**: nada de esto se venció, está por hacer.
- **Con todo al día no se pinta nada.** Un cartel que se repite deja de leerse
  — la misma lección del aviso de instalar la app.
- Reemplazó al renglón `#profe-planes`, que decía solo lo de los planes: dos
  lugares decidiendo qué se le dice al profesor terminan diciendo dos cosas.

#### El camino del entrenador, recorrido entero

Cada pieza tiene su verificador —tareas, planes, la clase en vivo, la
bitácora, informes— y todos comprueban SU pantalla. Lo que no comprobaba
ninguno es la **costura**: que un entrenador pueda recorrer el camino entero
sin encontrarse una puerta cerrada. `herramientas/verificar-camino-entrenador.js`
abre las 13 pantallas del camino, una detrás de otra, en un navegador de
verdad.

- **Con una profesora que NO administra**, que es la cara que ningún
  verificador miraba: los dobles suelen ponerle `is_admin` —el de las capturas
  de la guía lo hace a propósito, porque la guía tiene que enseñar todas las
  pantallas— y con eso los permisos no se prueban, porque quien administra pasa
  por todas partes.
- **Reusa el doble de `guia-capturas.js`**, que ya sabe servir 25 pantallas con
  sesión y datos de mentira. `clienteFalso()` acepta ahora `{ perfiles, yo,
  rpc, tablas }` y sin nada hace exactamente lo de siempre. Un doble escrito
  aparte se iría separando de este a la primera corrección.
  - Ahí mismo saltó la trampa de siempre: `tablas.profiles` **no es una tabla
    suelta**, se rellena con `DEMO.perfiles`, así que cambiar las cuentas sin
    cambiarla deja a la página sin encontrar a quien dice ser — y eso se ve
    como «No se pudo cargar tu perfil», que parece un fallo de la página y es
    del doble. Ya pasó con `verificar-aperturas-pagina.js` y con
    `verificar-informes.js`.
- Lo que mide es lo que se rompe callado: que ninguna pantalla **se vaya al
  login**, se quede en «Comprobando tu sesión…», le diga acceso denegado o
  pinte `undefined`; que desde todas se pueda **volver al panel** (un enlace a
  `clases.html` que se vea de verdad, medido con `checkVisibility()`) — una
  pantalla sin vuelta es un callejón del que solo se sale con el botón de
  atrás; y **que el destino que el panel PROPONE en cada uno de sus seis
  peldaños abra para ese mismo perfil**. Un peldaño que mande a una pantalla
  que le rebota no da ningún error: la franja se ve perfecta y el clic termina
  en el aviso de acceso denegado.
- El destino se lee **de la propia franja**, no de una lista copiada en el
  verificador: una lista escrita a mano se queda vieja y daría verde sobre
  enlaces que ya no son esos.
- Está probado que falla de verdad: apuntando el peldaño de los planes a
  `cobros.html` —que a quien no coordina le niega— salta.

### El registro de clases no se baja entero

Es la misma piedra de `informes.html`: con 100 clases, bajarlas todas y
pintarlas de corrido no sirve de nada —no se encuentra ninguna— y a partir de
cierta cantidad de filas **PostgREST corta la respuesta sin dar ningún error**.
Así que el filtro y el corte los hace la base y la página solo pinta:

- el periodo, con un `gte` sobre `started_at` (30 días, 3 meses, un año, todas);
- la búsqueda por título o notas, con un `or(...ilike...)`;
- la página, con un `range()` de 20 y un "Ver más clases";
- y la cuenta total con `count: "exact"`, que es lo que permite decir "Mostrando
  20 de 143" sin haber traído 143 filas.
- **El texto de búsqueda se limpia antes de mandarlo**: PostgREST arma el
  `or=(...)` con comas y paréntesis, así que un título con una coma rompería la
  consulta entera.
- Cada consulta lleva su marca (`sesionesPeticion`): una respuesta que llega
  tarde, después de que se escribió otra búsqueda, se descarta en vez de pintar
  el resultado de un filtro que ya no está.

Se muestra **agrupado por mes**, con el más reciente abierto y los de atrás
cerrados, y el encabezado de cada mes dice cuántas clases y cuántas horas. Eso
es lo que hace que un año de clases se pueda mirar. Qué mes quedó abierto vive
en `sesionesMeses`, o repintar los cerraría todos. Y la lista se repinta entera
desde lo que se lleva cargado, en vez de ir pegando filas: así un mes partido
entre dos páginas queda en un solo bloque y su encabezado cuenta bien.

### El panel, recorrido con lector de pantalla

Además de las tarjetas bloqueadas y el aviso de la clase (arriba), el recorrido
dejó tres arreglos que no se ven y que nada hacía fallar:

- **Al terminar de cargar, el foco va al `<h1>`** («¡Bienvenido, Sofía!»), que
  lleva `tabindex="-1"`. Sin eso, «Cargando tu panel…» desaparecía y el lector
  de pantalla no decía nada. Solo se mueve si el foco sigue en el `<body>`:
  arrancárselo a quien ya estaba navegando sería peor que el silencio.
- **«Contraseña» abre un diálogo de verdad** (`role="dialog"`, `aria-modal`,
  título enlazado): se lleva el foco al campo, Tab no se escapa, Escape lo
  cierra y el foco vuelve al botón. Antes era un recuadro al final de la página,
  sin foco y con un campo que solo tenía placeholder.
- La barra de «Continúa donde ibas» es un `progressbar` con su valor, el avatar
  (la inicial suelta) va `aria-hidden`, y los emojis de «Tu semana» también.

**Al tocar el panel, correr `node herramientas/verificar-panel.js`** (con el
sitio en localhost:8777 y playwright). Existe porque `clases.html` está detrás
del login: `verificar-css.js` abre las páginas sin cuenta, así que nada de esto
lo ve nunca. Comprueba en un navegador de verdad los grupos y su orden con las
tres caras (alumna, profesora, administración), que lo apagado esté apagado para
quien tiene que estarlo y abierto para los demás, que el registro mande a la
base un `gte`, un `ilike` y un `range` de 20 —su Supabase de mentira anota cada
consulta, así que si algún día alguien vuelve a bajarse la tabla entera se
nota— y **que la página se vea**: que el cartel de instalar arranque invisible
de verdad, que no haya CSS impreso como texto y que con el tema en oscuro el
fondo salga oscuro.

Comprueba además lo de arriba, que es lo que se rompe callado: que la franja de
tareas **se vea de verdad** (se mide el `display` que calcula el navegador, no
el atributo — la lección que dejó el cartel de instalar), que cuente las
pendientes y no las hechas, que una vencida la pinte en rojo y ninguna vencida
no, que **sin tareas y sin cursos a medias las dos franjas no se destapen**, que
"Continúa donde ibas" ofrezca el curso a medias más reciente y no el terminado,
y —lo que de verdad importa— que los tres números **salgan del RPC y que nadie
pida `training_progress`**: si alguien vuelve a sumarlos acá la página se ve
igual de bien hasta que un alumno cruza el techo de PostgREST. Y que a quien da
clase se le pinte "Tu semana" y **no** el panel del alumno.

De los peldaños del profesor comprueba los seis, que es donde está el error
fácil: que sin alumnos la franja **no ofrezca ninguna página** que la base le
vaya a negar (se mira el `href` de verdad) pero que a quien administra sí, que
«ninguna tarea puesta» no se confunda con «ninguna pendiente» —a quien mandó
cinco y las hicieron todas no se le pide la primera—, que «nunca dio clase» no
se confunda con «este mes no», y que con todo al día la franja **no se
destape** (se mide el `display` que calcula el navegador). Está probado que
falla de verdad: cambiando `tareas_puestas` por `tareas_pendientes`, saltan
seis comprobaciones.

De los exámenes en la franja comprueba los seis estados en que se puede estar,
que son justamente los que se distinguen mal: que uno entregado no la destape,
que uno con el reloj corriendo **mande sobre una tarea vencida** y lleve directo
a terminarlo, que al que se le pasó la fecha **no se le diga «todavía puedes»**
—el texto de la tarea, que ahí sería mentira— ni se le ofrezca la pantalla que
lo va a rechazar, que al congelado se le diga quién tiene que reabrirlo, que el
título cuente las dos clases de cosa ("3 tareas y 1 examen") y **que no se
inventen los minutos que quedan**, que eso lo sabe el servidor. Sus exámenes de
mentira se cuelgan de HOY y no de una fecha escrita, como las clases: con fechas
fijas la prueba se pudre sola con el almanaque.

- Su Supabase de mentira **resuelve las columnas de tabla relacionada**
  (`profiles.grupo`, que es como PostgREST las nombra). Sin eso ese filtro no
  encontraba nunca nada, así que el récord de racha táctica salía siempre en
  "todavía nadie" y la prueba daba verde porque no lo miraba.

### El buscador del panel

Encima de la grilla va «¿Qué buscas?». Quien administra ve trece grupos y casi
sesenta tarjetas: para llegar a Cobros había que saber que vive en
«Herramientas», y quien busca «pagos» no lo encuentra con los ojos, porque
ninguna tarjeta se llama así.

- **Filtra la grilla que YA está pintada; no tiene su propia lista de
  destinos.** Lo que el rol de cada quien no tiene no está en la grilla, así
  que tampoco aparece al buscar. A la alumna, «cobros» no le encuentra nada.
  Una segunda lista de «todo lo que existe» se habría desordenado de
  `TILE_GROUPS` a la primera tarjeta nueva, y encima habría ofrecido destinos
  que la persona no puede usar.
- **Lo único propio son las palabras clave** (`CLAVES_BUSQUEDA`): cómo pide la
  gente una cosa que se llama distinto. «pagos» y «mensualidad» es Cobros,
  «contraseña» y «avisos» es Configuración, «deberes» es Tareas. Van por
  destino (el `href` sin su `?tema=`), así que valen igual en el panel de quien
  supervisa y en el de administración. **Cada clave tiene que ser cierta**: está
  porque esa página lo tiene. Una clave que promete lo que la página no hace
  lleva a alguien al lugar equivocado con toda confianza.
- Se busca en el nombre, la descripción que ESA persona ve (la de alumno o la
  `descProfe`), la nota de la tarjeta, las claves y el rótulo del grupo. Sin
  tildes ni mayúsculas, y **tienen que estar todas las palabras**: «cobros
  academia» deja una sola.
- **Enter abre la primera** tarjeta que quedó (la primera con enlace: una
  apagada no cuenta). **Escape** borra y vuelve a mostrar todo. **Ctrl + K**
  (⌘ + K en Mac) y **«/»** llevan al buscador desde cualquier parte del panel.
  «/» solo cuenta cuando no se está escribiendo en otro campo.
- Un grupo del que no queda ninguna tarjeta se esconde entero, igual que
  `renderTiles()` no pinta un grupo vacío. El botón de la videollamada va con
  «Sesión en vivo»: si la tarjeta se va, el botón también.
- El resultado se anuncia en un `role="status"` («1 acceso con «pagos». Enter
  abre «Cobros de la Academia».»), **pero no a cada tecla**: espera a que se
  deje de escribir (350 ms). Con lector de pantalla, «tres accesos» por cada
  letra tapaba lo que se estaba escribiendo. Sin resultados, dice qué probar.
- **El texto que se busca se arma al pintar** (`data-buscar` en cada tarjeta y
  en cada grupo). El de «Sesión en vivo» va en su envoltorio `#sesion-wrap`,
  que no se repinta, porque la tarjeta de adentro se repinta sola al abrir o
  cerrar la clase. `renderTiles()` vuelve a aplicar la búsqueda al final, así
  que un repintado no devuelve lo que estaba filtrado.
- **Va arriba de todo, justo debajo del saludo**: es lo primero que se ve al
  entrar, antes de la clase en curso y de «Tu semana». Primero estuvo encima de
  la grilla, pero para quien administra eso quedaba una pantalla más abajo, y
  el buscador existe justamente para quien más tarjetas tiene.
- **Mientras se busca, todo lo que va debajo y no es la grilla se hace a un
  lado** (la clase en curso, la semana, el progreso, el registro de clases).
  Si no, los resultados quedaban lejos del campo, y debajo de ellos el registro
  decía «Ninguna clase coincide con el filtro», como si le contestara a la
  búsqueda. Se esconde con `style.display` y no con `hidden`, porque ese
  atributo lo maneja el código de cada bloque. Al borrar lo escrito, cada
  bloque queda exactamente como estaba.
- **Cada palabra buscada se compara con el COMIENZO de una palabra**, no con
  cualquier pedazo: «mari» traía la tarjeta de Cursos porque su descripción
  dice «temario», y Enter abría Cursos en vez de a María. El texto que se busca
  se guarda solo con letras y números, separados por espacios.
- **También encuentra personas.** A quien da clase, coordina, supervisa o
  administra, debajo del campo le aparecen las personas que coinciden, de a
  seis, con cuántas hay en total. **Lo que se puede encontrar lo decide la
  base**: `mi_gente()` devuelve solo a quien cada uno alcanza (sus alumnos si
  da clase; sus profesores y los alumnos de ellos si coordina o supervisa;
  todos si administra), filtra sin tildes y corta. Al alumnado no se le busca
  gente: ni se le pide a la base.
  - Un alumno lleva a su informe (`informes.html?alumno=<id>`). Informes lo
    elige solo si está en la lista de quien mira; si no, se queda el resumen.
  - Un profesor lleva a Coordinación con su nombre puesto
    (`coordinacion.html?buscar=…`), solo si quien busca puede entrar ahí
    (administración, coordinación o supervisión). A un profesor que no
    coordina no se le ofrece un enlace que la página le va a negar.
  - Se consulta cuando se deja de escribir (300 ms), y una respuesta que llega
    tarde, con otro texto ya escrito, se descarta. El anuncio (`role="status"`)
    cuenta las dos cosas: «1 acceso y 2 personas con «mari»». Si no quedó
    ninguna tarjeta, Enter abre la primera persona.
- **`clases.html?buscar=…`** abre el panel con el foco en el buscador y, si
  viene un texto, ya buscándolo. Es a donde lleva el Ctrl + K de las demás
  páginas (ver «Ctrl + K en toda la Academia» en sitio-e-infraestructura.md).
  Después se limpia la dirección, para que recargar no vuelva a buscar.
- Lo prueba `pruebaBuscador` en `verificar-panel.js`, midiendo con
  `checkVisibility()` qué tarjetas quedan a la vista.

### El panel de quien administra no es el de un profesor

Quien administra **no da clase**: se encarga de que toda la empresa vaya bien y
funcione bien. Aun así, su panel era el de un profesor con cosas encima:
«Iniciar clase», «Tu semana» con sus alumnos y sus tareas, el registro de
clases, la sesión en vivo con su videollamada, «Lo que le pones a tus
alumnos», planes de clase, asistencia presencial, informe mensual, subgrupos y
el primer paso «Todavía no tienes alumnos». Todo eso sobre una cuenta que no
tiene alumnos propios. Lo pidió el dueño del sitio: quitarle todo lo de dar
clase.

- **Se le pinta OTRO panel, escrito entero en `ADMIN_GROUPS`**, igual que a
  quien supervisa (`SUPERVISOR_GROUPS`). No se le recorta el del profesor
  tarjeta por tarjeta: con cada tarjeta nueva del profesor habría que acordarse
  de quitársela, y la que se olvide aparece. Los grupos: «Administración»,
  «Supervisión y coordinación», «Formularios», «Cobros y accesos»,
  «Resultados de las pruebas», «Torneos», «Revisar el contenido» y «Tu
  cuenta». Es la lista de TODAS sus páginas (ver «Una sola puerta para cada
  cosa»).
- **Arriba va el resumen de toda la plataforma**: estudiantes, profesores y
  quiénes llevan 4 días sin entrenar. Es la misma tarjeta de quien supervisa,
  con el título «Toda la plataforma». Los números se cuentan en la base:
  `mi_gente()` trae el total, y `informes_inactivos()` se cuenta con
  `{ count: "exact", head: true }`, sin bajarse la lista.
- **Nada de la clase**: no se pide el estado de la clase, no se carga el
  registro, no se suscribe a las sesiones ni se piden la videollamada ni
  `panel_profesor()`. El `if (profile.is_admin)` corta antes de todo eso.
- **«Revisar el contenido» sí está**: cursos, entrenamiento, estudio,
  artículos, TV en vivo, la guía del profesor y el lector de planilla. Su
  trabajo es que todo funcione, y esas son las páginas que usa el alumnado,
  para abrirlas y comprobarlas.
- **Lo de dar clase lo sigue pudiendo revisar con «Ver como: profesor»**
  (`js/modo-vista.js`). Ahí `profile.is_admin` viene en `false` y se pinta el
  panel docente completo, que es para lo que existe el selector.
- Lo que ya veía de los profesores lo sigue viendo. Informes, Supervisión y el
  Tablero por academia muestran a todos: eso es supervisar, no dar clase. La
  regla de `CLAUDE.md` quedó así: lo que un profesor ve de sus alumnos,
  administración lo ve de todos, pero su panel no trae herramientas de dar
  clase.
- **La burbuja de «alumnos en línea» SÍ se queda** en el panel de quien
  administra. Se consideró quitarla, porque muestra a los alumnos conectados
  como en el panel de un profesor, pero el dueño del sitio decidió dejarla. Ver
  quién está conectado también es supervisar. No se quita al limpiar lo de dar
  clase.
- Lo prueba `pruebaAdmin` en `verificar-panel.js`:
  - los grupos, en su orden;
  - que no quede ningún destino de dar clase (sesión, tareas, exámenes,
    planes, asistencia, informe mensual, subgrupos, archivos, juegos, torneos);
  - que sí estén los de supervisar y administrar;
  - que no se vean el estado de la clase, «Tu semana», el registro ni el
    primer paso;
  - que el conteo de inactivos vaya con `head`;
  - y que «Ver como: profesor» devuelva el panel docente.

## La burbuja de "quién está conectado"

El pedido era de quien da clase: **ver cuántos estudiantes están conectados
ahora mismo en la plataforma y quiénes son, «tipo burbuja adicional sin que
estorbe en ningún lado»**. Es `js/burbuja-en-linea.js`, una burbuja flotante
abajo a la derecha que `herramientas/academia-cabecera.py` pone en las páginas
de la Academia.

- **Quien da clase** (y quien administra) ve el conteo de sus alumnos
  conectados y, al abrirla, quiénes son y en qué página andan.
- **El alumno no ve nada**: solo se anuncia en el canal de cada profesor suyo.

### La burbuja ya no tiene chat

Al principio la burbuja también servía para escribirle a un alumno conectado y
que él contestara desde la página que tuviera abierta (sobre
`class_chat_messages`, la tabla del chat de la clase en vivo). **El dueño del
sitio pidió quitar el chat y dejar solo los conectados.** Se quitó entero: el
campo para escribir, los hilos, el aviso de «sin leer», la escucha de Realtime
sobre `class_chat_messages` y la marca de leídos en `localStorage`
(`burbuja_leidos_v1`, que queda huérfana en los aparatos que ya la tenían; no
molesta). Las filas de la lista son `<li>`, no botones: no abren nada.

- El chat sigue existiendo donde nació: **dentro de `sesion.html`**, con la
  clase abierta. Los mensajes viejos que se escribieron desde la burbuja están
  en esa misma tabla y se leen ahí.
- `verificar-burbuja.js` comprueba que no quede ningún campo para escribir, que
  las filas no sean botones y que no se haga **ni una** consulta a
  `class_chat_messages`, ni del lado del profesor ni del alumno.
- Si algún día se quiere de vuelta, está en el historial de git (el commit que
  quitó el chat dice qué había).

### El canal es POR PROFESOR, y lo que llega por él no se cree

Un canal de presencia de Supabase **no pasa por la RLS**: lo escucha —y se
anuncia en él— cualquiera que sepa su nombre. De ahí las decisiones que
sostienen esto:

- **No hay un canal global.** Un `academia-en-linea` para todos le repartiría a
  los mil doscientos alumnos la lista de quién está conectado y en qué página
  — que es exactamente la fuga que ya se cerró una vez, cuando el canal de
  Juegos anunciaba con quién estudiaba cada quien. El alumno se anuncia en
  `academia-en-linea:<profesor>`, **uno por cada profesor suyo**, y el profesor
  escucha el suyo. Lo peor que puede oír alguien que se cuele en el canal de su
  propio profesor son sus compañeros, que es lo que `es_companero()` ya le deja
  ver en `profiles`. Mismo patrón que `clases-presence:<boardOwnerId>`.
- **La lista se cruza contra `profiles` y el nombre que se pinta es el de la
  BASE, no el del canal.** Sin ese cruce, cualquiera podría anunciarse en el
  canal de un profesor ajeno con el nombre que quisiera y aparecerle en la
  burbuja, y la pantalla se vería perfecta. Se pide con `.in(ids)` sobre los
  conectados de ahora —nunca la tabla entera, que es la piedra de PostgREST— y
  quien la base no reconoce **no se pinta**.
- **Por el canal va lo justo: id, nombre y en qué página anda. El correo NO.**
  En la Academia son menores de edad y ese canal lo escucha cualquiera que sepa
  su nombre. El nombre viaja solo como respaldo; lo que se pinta sale de la base.
- **La página se dice con el `<title>`, no con el `pathname`.** «entreno/4x4.html»
  no le dice nada a quien lo lee; el título ya está escrito para leerse.

### Quien administra escucha el canal de cada profesor

**Pasó**: con una clase entera conectada, la burbuja de quien administra decía
«0 alumnos en línea». Eran dos causas, y ninguna daba error:

- **Nadie se anuncia en el canal de quien administra**: no es profesor de
  nadie. Escuchaba solo `academia-en-linea:<su id>`, así que para él siempre
  había cero. Ahora escucha también el canal de cada profesor (los pide a
  `profiles` con `role = 'profesor'`, que la RLS le deja ver) y junta a todos.
  No se abre ningún canal global: son los mismos canales por profesor, y lo
  que ve ahí ya lo ve en `profiles`. Tope de 90 canales (Realtime deja 100 por
  cliente); con siete profesores sobra.
- **La lista se arma con TODOS los canales en cada sync**, no con el que acaba
  de hablar: antes cada sync la vaciaba y quedaban solo los del último
  profesor. Un alumno con dos profesores sale una vez, con su anuncio más
  reciente.
- **El alumno que está en la clase en vivo no se anunciaba**: `sesion.html`
  no llevaba el script. Ahora lo lleva con `data-solo-anunciar` (`SOLO_ANUNCIA`
  en `academia-cabecera.py`): no se pinta nada para nadie, quien da clase no
  hace nada (ya tiene su lista) y el alumno se anuncia como «Clase en vivo».
  **Ahí cuenta como conectado aunque no toque nada y con la pestaña de
  fondo**: mirar y escuchar la clase es estar, la misma regla de
  `class_presence_log`.
- `examen.html` y `tienda.html` siguen sin el script: el alumno en un examen
  no se cuenta.

### "Conectado" quiere decir lo mismo que en el resto del sitio

Tener la pestaña abierta no es estar. `js/tiempo-plataforma.js` ya decidió qué
cuenta como activo —60 segundos sin un clic, una tecla o un scroll, o la
pestaña de fondo— y acá se usa **el mismo número**: al pasar de ahí se deja de
anunciar y al volver la actividad se vuelve a anunciar. Si no, la burbuja diría
«3 conectados» de gente que dejó la página abierta y se fue.

### Que no estorbe es la mitad del pedido

- **Al alumno no se le pinta nada.** No necesita saber quién está conectado.
  Al profesor se le queda siempre: el conteo es el dato, y «ahora mismo no hay
  nadie» también es una respuesta.
- **Un alumno sin ningún profesor no hace nada**: no hay a quién anunciarse.
- **Va en `z-40`, debajo del encabezado (`z-50`).** Si empataran, al desplegarse
  taparía el interruptor de tema.
- Escape la cierra **y devuelve el foco al botón**: un panel que se cierra
  dejando el foco en la nada deja perdido a quien usa teclado. El botón lleva
  `aria-expanded` y `aria-controls`, y el contador va en una región viva.
- **Tres páginas de la Academia se quedan SIN burbuja visible** (`SIN_BURBUJA` en
  `academia-cabecera.py`): `sesion.html`, que ya tiene su propia lista de
  conectados en un panel hecho para eso; `examen.html`, donde un panel que se
  despliega es la distracción que el antitrampa viene a evitar; y
  `tienda.html`, donde la burbuja tapaba el botón de pedido (ver «La burbuja le
  tapaba el botón de comprar»).
- El nombre de un alumno **lo escribe una persona**, así que va siempre por
  `textContent` — la misma regla de la bitácora y de `renderStudentsList()`.
- **Y sobre todo: no ensucia ninguna.** Se agrega a decenas de páginas que ya
  funcionaban, así que su arranque entero va en un `catch`: lo que falle se
  queda en una línea de consola y la burbuja no se monta. **Eso salió en la
  primera corrida**: los dobles de Supabase de media docena de verificadores no
  tienen canales de presencia, así que `sb.channel` no existía y el TypeError
  salía en la consola de `informes.html` —`verificar-notas.js` lo cazó por su
  comprobación de «sin errores en la consola»—. Son **dos piezas y hacen falta
  las dos**: la salida limpia (`if (!sb.channel) return`, porque sin canales no
  hay nada que montar) y el `catch` detrás, que es la red.
  - Por eso **NO se les agregó `channel()` a los dobles de los otros
    verificadores**: ahí la burbuja no se monta y no tiene por qué — quien la
    comprueba es `verificar-burbuja.js`, con su doble que sí los tiene.

### Dónde se pone la línea

La pone **`herramientas/academia-cabecera.py`**, con las marcas
`<!-- burbuja: inicio -->` / `<!-- burbuja: fin -->`, así que se puede correr
todas las veces que se quiera. Va ahí y no en un script aparte porque **la
lista `PAGINAS` es la misma**: con dos listas, la página nueva entra en una y
se olvida en la otra — que es exactamente lo que ya pasó entre
`verificar-pwa.js` y `pwa-cabecera.py`. **Al agregar una página de la Academia,
sumarla a esa lista y correr el script.**

**Al tocar `js/burbuja-en-linea.js` o el generador, correr `node
herramientas/verificar-burbuja.js`** (con el sitio en localhost:8777 y
playwright). Su Supabase de mentira tiene **canales de presencia de verdad**:
la prueba siembra quién está conectado y dispara el sync, como haría Realtime,
y **anuncia también a un intruso con el nombre que él eligió** — que es lo que
puede hacer cualquiera con sesión. Comprueba que el intruso no se pinte y que
el nombre que salga sea el de la base; que no haya chat; que al alumno **no se
le pinte nada** (se mide `checkVisibility()`, no la clase); que se anuncie a
**sus dos** profesores y no solo al principal; que con la pestaña de fondo deje
de anunciarse; que un nombre con una etiqueta adentro no se ejecute **y se siga
viendo, literal**; que Escape cierre y devuelva el foco; y que la línea esté en
todas las páginas de la Academia, en ninguna de las exceptuadas, y con una ruta
relativa que **llegue de verdad al archivo** (un 404 ahí no avisa: la burbuja
simplemente no aparece).

Comprueba además, con un cliente **sin canales de presencia**, que no se monte
y que **no deje ni un error en la consola** — que es lo que de verdad la hace
segura de poner en tantas páginas.

## El panel de Administración

`admin.html` es de quien administra. Lo que hace está en las secciones de
abajo (lo urgente, cuentas, profesores…); cómo se reparte en la pantalla, en
«El panel de Administración, por secciones», y qué va acá y qué en el panel de
la Academia, en «Una sola puerta para cada cosa».

### El panel de Administración, por secciones

Era **una sola página larguísima**: el botón de Informes, «Ver como», los
atajos, cinco tarjetas plegadas (crear cuenta, novedades, profesores,
supervisores, equipos) y al final la lista de cuentas. Para llegar a Equipos
había que saber que estaba ahí y bajar; lo plegado no se encontraba. Se pidió
algo «más sencillo de usar», con la forma de un tablero: menú a la izquierda y
tarjetas.

- **Un menú a la izquierda y UNA sección a la vista**, por grupos (hoy: ver
  «Una sola puerta para cada cosa»). En el celular el menú es una tira de arriba que se
  desliza. Cada sección es un `<section data-seccion>` y la muestra `irA()` de
  `js/admin.js`; **los ids de adentro no cambiaron**, así que todo el resto del
  código siguió igual. Ya no hay `<details>`: una sección no se pliega.
- **La dirección lleva la sección** (`admin.html#equipos`): atrás/adelante del
  navegador y un enlace guardado llevan a la misma.
- **«Inicio» es «Lo urgente»** (ver «Lo urgente primero»). Antes decía cuántas
  cuentas, estudiantes y profesores había, con Informes, «Lo de todos los
  días» y «Ver como» debajo: todo eso estaba repetido en otro lado y se quitó
  (ver «Una sola puerta para cada cosa»). Los alumnos sin profesor siguen a un
  clic: son un pendiente de «Lo urgente», que abre Cuentas con el filtro
  puesto, contado sobre la lista entera que ya se pide de mil en mil.
- **El buscador de cuentas está arriba, en todas las secciones**: buscar a
  alguien es lo que más se hace acá. Escribir lleva a Cuentas. Si se viene de
  otra sección, **se quita el filtro de rol** que hubiera quedado puesto: no se
  ve desde ahí, y seguiría escondiendo gente sin que se note.
- El menú lleva **un solo número**: cuántas cosas urgentes hay, junto a «Lo
  urgente». Antes llevaba también el de alumnos sin profesor junto a
  «Profesores»; ese ya está dentro de lo urgente, y dos números en el menú
  hacían pensar que eran dos problemas.
- **Los colores son los del sitio** (el azul de la marca y el ámbar de los
  botones), no los de la imagen de referencia: son los que ya tienen el
  contraste medido y los que cambian con el tema de la plataforma.
- `verificar-admin.js` mide con `checkVisibility()` que al entrar se vea solo
  Inicio, que «sin profesor» salga de las 1205 cuentas de prueba (con 1000 se
  habría vuelto a pedir de un solo tiro) y lleve a sus cuentas,
  que buscar desde otra sección lleve a Cuentas sin el filtro viejo y que
  `#supervisores` abra Supervisores. Las pruebas que tocan una sección van
  primero a ella con el menú, como una persona.

### Lo urgente primero

El dueño del sitio no encontraba lo importante ni lo urgente: al entrar, el
panel decía cuántas cuentas había, y lo que esperaba a alguien había que ir a
buscarlo página por página. **Quien administra está para ayudar a supervisores
y coordinadores**, y el panel se reordenó alrededor de eso.

- **«Inicio» es «Lo urgente»**: una lista de pendientes, cada uno con su
  número, por qué importa y un botón que lleva a donde se resuelve. Primero
  lo **urgente** (alguien espera): solicitudes de ingreso sin responder,
  justificaciones de ausencia por revisar, alumnos sin profesor y profesores
  que nadie supervisa ni coordina. Después lo que hay que **vigilar**:
  supervisores sin nadie a cargo, coordinadores sin profesores, quién dijo
  este mes en la encuesta que no sigue, saldos vencidos y alumnos con 4 días o
  más sin entrenar. El nivel va escrito («Urgente», «A vigilar»), no solo en
  el color. El menú lleva cuántas cosas urgentes hay.
- **Lo que está en cero no desaparece**: va en «Al día», para que se sepa que
  se revisó. Y **un conteo que falla no se pinta como cero**: sale «No se pudo
  revisar». Un «al día» falso es peor que no decir nada.
- **Todo se cuenta en la base** (`js/pendientes.js`):
  `solicitudes_academia` con `head`, `justificaciones_pendientes()`, y
  `cobros_morosos()`, `respuestas_satisfaccion(…, p_solo_se_van)` e
  `informes_inactivos()` con `{ count: "exact", head: true }`. Lo único que se
  cuenta en la página es lo que sale de las cuentas que ya trae enteras. Los
  saldos vencidos son filas de `cobros_morosos()`: una por alumno **y
  moneda**, y así lo dice el texto.
- **Quién tiene a cargo a quién está donde se arregla**, no en una sección
  aparte:
  - en **Profesores y coordinadores**, cada profesor dice quién lo supervisa y
    quién lo coordina («Supervisa: Marta · Coordina: Luis», o «⚠️ Nadie lo
    supervisa ni coordina»); cada coordinador, cuántos alumnos abarca y
    cuántos llevan 4 días sin entrenar; y arriba, resaltados, los profesores
    que nadie ve, con «👁 Ver su panel» (`clases.html?ver_como=`);
  - en **Supervisores**, la ficha de cada uno dice a cuántos profesores y
    alumnos cubre de verdad y cuántos llevan 4 días sin entrenar (a quién
    llamar), o que no tiene a nadie.
  - **Quién supervisa a un profesor lo contesta `supervisores_de()`**, una
    llamada por profesor en paralelo (son decenas). Armarlo con
    `supervisor_cuentas` dejaba afuera lo que llega por la academia: el
    verificador tiene una supervisora que ve a su profesora solo por la
    academia, y con la tabla saldría «sin supervisor».
  - Quien supervisa no cuenta como «profesor sin nadie» (no hay supervisor de
    supervisores); un coordinador sí, porque también lo revisa un supervisor.
  - Cada cambio de un supervisor o un coordinador vuelve a contar todo.
  - Primero hubo una sección «Quién cubre a quién» con dos tablas; se quitó
    porque repetía la lista de supervisores y la de coordinadores.
- Lo prueba `pruebaUrgente` en `verificar-admin.js`: el orden, el «al día», el
  número del menú, que se cuente con `head`, a dónde lleva cada pendiente,
  quién tiene a cargo a cada profesor, lo que cubre cada supervisor y que un
  conteo caído no diga «al día». Rompiendo a propósito `supervisores_de` o
  haciendo que un error cuente como cero, salta.

### Una sola puerta para cada cosa

Después de ordenar lo urgente, el dueño pidió revisar que no hubiera
**información repetida ni dos caminos al mismo lugar**, para no perderse. Había
muchos:

- `admin.html` tenía «Herramientas», una segunda lista de páginas (informes,
  cobros, formularios, resultados, supervisión…) que casi calcaba el panel de
  la Academia de quien administra, más «Lo de todos los días» y el recuadro de
  Informes en Inicio;
- el panel de la Academia repetía «Lo urgente» y tenía una tarjeta a una
  sección de `admin.html`;
- supervisores y coordinadores salían en dos secciones cada uno;
- «Ver como» estaba en el selector del panel y en una tarjeta de
  `admin.html`; «Crear cuenta», en el menú y en un botón de Cuentas; el número
  de alumnos sin profesor, en Inicio, en el menú y en Profesores.

La regla que quedó: **cada pantalla hace lo suyo, y cada destino tiene una sola
puerta.**

- **El panel de la Academia (`clases.html`, `ADMIN_GROUPS`) tiene TODAS las
  páginas**, que es donde entra quien administra: Administración (esta
  página) y Academias; Supervisión y coordinación; Formularios; Cobros y
  accesos; Resultados de las pruebas; Torneos; Revisar el contenido y Tu
  cuenta. Lo que solo estaba en Herramientas (precios, prueba gratis,
  jugadores de chess-results, el arbitraje del público) vino para acá.
- **`admin.html` tiene lo que se maneja adentro**, con el menú en cuatro
  grupos: «Hoy» (Lo urgente), «Supervisión y coordinación» (Supervisores,
  Profesores y coordinadores, Equipos), «Personas» (Cuentas, Crear cuenta) y
  «La plataforma» (Avisos internos, Salas de torneos, Preparación de rivales).
  A otras páginas solo lleva desde un pendiente de «Lo urgente» (a donde se
  resuelve) y desde su subtítulo, que dice dónde están las demás.
- «Novedades» de `admin.html` pasó a llamarse **«Avisos internos»**: son los
  avisos entre quienes administran, y con el mismo nombre se confundía con
  «Actualizaciones» (`novedades.html`, lo que se le ha hecho al sitio).
- La descripción del examen de arbitraje decía «los del público» en una lista
  y «del equipo docente» en la otra. `arbitraje.html` es el del equipo
  docente; el del público es `informes.html?tema=arbitraje`, y ahora cada uno
  dice lo suyo.
- Lo prueban `pruebaUnaSolaPuerta` en `verificar-admin.js` (el menú por
  grupos, una entrada por sección, que no vuelvan los atajos, «Ver como» ni
  los números repetidos, y que la página no enlace a otras fuera de lo
  urgente) y `pruebaAdmin` en `verificar-panel.js` (los grupos, que cada
  destino esté una sola vez, que lo de Herramientas esté en el panel y que
  **cada tarjeta lleve a un archivo que existe** y, si lleva `?tema=`, a un
  tema que `informes.html` de verdad tiene: si se le cambia el nombre a una
  opción, el enlace lleva al resumen general sin decir nada). Probado
  rompiéndolo: un atajo metido en `admin.html` y un enlace mal escrito en el
  panel saltan.
- El tema `diagnostico-publico` (hermano del de arbitraje público) existe
  porque los diagnósticos de visitantes son contactos para invitar a la
  Academia y se consultan seguido: en el tema `diagnostico` había que bajar a
  buscarlos.

### El panel de quien supervisa, sin caminos repetidos

Lo mismo que en administración, pedido por el dueño para el panel de quien
supervisa (`SUPERVISOR_GROUPS` y `cargarUrgenteSupervisor()` de
`js/clases.js`): lo urgente primero y cada destino una sola vez.

- **Arriba va «Lo urgente»**, antes de sus números «A tu cargo». Lo
  **urgente** es lo que alguien espera: solicitudes sin responder,
  justificaciones por revisar y **los informes mensuales de sus profesores
  sin leer** (el pendiente propio de quien supervisa). Lo que hay que
  **vigilar**: quién dijo este mes en la encuesta que no sigue y los saldos
  vencidos. Solo sale lo que tiene algo; lo que está en cero va en una línea
  «✓ Al día: …», y un conteo que falla dice «No se pudo revisar», nunca cero.
  - **Lo cuenta `js/pendientes.js`, el mismo de `admin.html`** (antes
    `pendientes-admin.js`; se renombró al usarlo dos paneles). Cada panel
    pide solo sus claves. **La base acota cada conteo a su gente**: las
    justificaciones y los cobros por `bajo_mi_coordinacion`, las encuestas por
    `supervisados_por_mi()`, los informes por la política de
    `informes_profesor` (el enviado de un profesor que supervisa). Las
    solicitudes no tienen academia: ve las mismas que en `solicitudes.html`.
  - **Los informes se cuentan sin los suyos** (`neq("profesor_id", yo)`):
    quien supervisa también es profesor, y su propio informe enviado lo ve.
  - **Los que no entrenan no entran en la lista**: ya son el número rojo de
    «A tu cargo», justo debajo. El mismo dato dos veces hace pensar que son
    dos problemas.
- **Una sola puerta a Informes.** Quince tarjetas abrían `informes.html`, cada
  una con otro `?tema=` (siete de ellas en un grupo plegado), cuando la página
  ya trae el selector de tema con todos. Ahora es una tarjeta, «Informes de tus
  estudiantes». La única que conserva su tema es «Diagnóstico de visitantes»:
  no es mirar a sus estudiantes, es repartir su enlace. Las palabras con que
  se pedían esos temas («mates», «sin entrenar», «diagnóstico»…) se sumaron a
  las claves de búsqueda de Informes, así que el buscador del panel las sigue
  encontrando; las claves ahora se buscan primero por la dirección completa,
  para que la tarjeta de visitantes no herede las de toda la página.
- **El grupo plegable se fue, y con él el mecanismo** (`plegar()`,
  `aplicarPlegado()`): era el único que lo usaba.
- Tampoco va ya «Ver el informe completo →» en la tarjeta de números (la de
  quien supervisa y la de quien administra): llevaba al mismo lugar que el
  número de estudiantes.
- Los grupos: «Mi academia» (lo de todos los días, primero a pedido del
  dueño), «Tus profesores», «Tus estudiantes», «Cobros y formularios» y «Tu
  cuenta». «Cuenta nueva» (`formularios.html?alta=1`) y «Formularios de
  inscripción» (`formularios.html`) abren la misma página, pero son dos cosas
  distintas: dar de alta a alguien hoy y armar un formulario para compartir.
- Lo prueba `pruebaSupervisor` en `verificar-supervisor.js`: los grupos, que
  ningún destino esté dos veces, que Informes sea una tarjeta, «Lo urgente»
  antes de los números con su orden, su nivel escrito y su destino, el «al
  día» y que los informes se cuenten con `head` y sin los suyos. Rompiendo a
  propósito el `neq` o devolviendo una tarjeta de tema, salta.

### El panel de quien da clase

El mismo pedido, para el panel del profesor: lo urgente primero, cada cosa en
su lugar y sin caminos repetidos.

- **Se reparte por lo que se viene a hacer** (`PANEL_DOCENTE` y
  `ordenarPanelDocente()` de `js/clases.js`), no como el panel del alumno con
  cosas encima: «Clase en vivo»; «Tus alumnos» (tareas, exámenes, informes,
  justificaciones, subgrupos); «Tus clases» (planes, asistencia presencial,
  repasar, archivos, la preparación de rivales si se la activaron y el informe
  mensual); «Coordinación», solo a quien coordina (coordinación, solicitudes,
  formularios y cobros, lo que su supervisor no le apagó); «Aprender»; «Jugar
  y competir» y «Tu cuenta» (configuración y logros). Antes todo lo suyo caía
  en «Herramientas», y Informes vivía en «Tu cuenta» aunque es de sus
  alumnos.
  - Se ordena **sobre la lista ya armada**, así respeta lo que cada quien
    tiene. Las tarjetas se buscan por destino: una nueva que no esté en
    `PANEL_DOCENTE` cae en «Otras», y `verificar-panel.js` pide que ese grupo
    no exista.
  - Vale igual para «Ver como: profesor» de quien administra y para el panel
    de otra persona.
- **El diagnóstico ya no es una segunda puerta a Informes.** A quien da clase
  su tarjeta lo llevaba a `informes.html?tema=diagnostico`; ahora es solo del
  alumnado (`soloAlumno`), y el profesor lo encuentra en Informes, que tiene su
  selector de tema.
- «Tu semana» ya no lleva «Ver informe completo →»: llevaba al mismo lugar que
  el número de alumnos y que la tarjeta Informes.
- **«Lo urgente» va antes que «Tu semana», y solo cuando hay algo** (su panel ya
  tiene la franja del primer paso y «Tu semana»; un «todo al día» diario deja
  de leerse). Es la misma tarjeta del supervisor (`cargarUrgente()`), con lo
  del profesor:
  - justificaciones de sus alumnos por revisar;
  - **su informe mensual del mes pasado sin enviar**, solo si tiene
    supervisión (`mis_supervisores()`), la misma regla que los recordatorios
    de `recordar_informes_mensuales()`; se busca el enviado de ESE mes con su
    id;
  - si coordina, solicitudes y saldos vencidos.
  - **Cada uno solo si su tarjeta está en el panel** (`clavesUrgenteDocente()`):
    a un coordinador al que le apagaron los cobros ni se le preguntan. Sería
    decirle «al día» sobre algo que no ve.
  - Las tareas vencidas y los que no entrenan no se repiten: son números de
    «Tu semana».
- Lo prueban `pruebaProfesora` (los grupos en su orden, un destino una sola
  vez, una sola puerta a Informes), `pruebaUrgenteProfesora` (lo que sale, a
  dónde lleva, el informe con su id y su mes, que con todo al día no aparezca
  y que sin supervisión no se reclame), `pruebaPreparacionRivales` y
  `pruebaCoordinadorRecortado` en `verificar-panel.js`. Rompiendo a propósito
  el filtro `soloAlumno` o dando el informe por enviado, saltan.

### El panel del alumno, sin caminos repetidos

El mismo pedido para el panel del alumno. Casi todo ya seguía el criterio, y
se dejó como estaba:

- **Su «Lo urgente» es la franja de arriba** (`#pendientes-aviso`): las tareas
  y los exámenes con fecha (y rojo lo que ya venció), el diagnóstico que le
  pidió su profe y, si no tiene nada, el primer paso. No se le agregó una
  segunda tarjeta como la del profesor: la franja contesta la misma pregunta
  («¿qué hago ahora?»), y dos bloques peleando el primer lugar es el problema
  que este panel ya tuvo con «Estado de la clase». La clase en vivo, si está
  abierta, va encima de todo.
- **El orden de la página ya era el de las preguntas que uno se hace**: qué
  me toca, por dónde iba, cómo voy y, después, a dónde puedo ir (lo dice el
  comentario de `#progreso-alumno` en `clases.html`). El orden de «Tu cuenta»
  lo pidió el dueño.
- Los números de «Tu progreso» siguen llevando cada uno a lo suyo (la racha a
  Logros, los ejercicios a su página): un número que no lleva a nada obliga a
  ir a buscarlo.

Lo que sí cambió, por ser dos puertas al mismo lugar:

- «Tu progreso» ya no lleva «Ver informes completos →»: Informes es una
  tarjeta de «Tu cuenta».
- **«Tu última clase» abre el repaso de ESA clase**
  (`repasar-clases.html?repaso=<clase>`, «🎞️ Repasar esta clase →»): lo que
  no le salió, para resolverlo otra vez, y debajo la partida. Antes llevaba a
  la lista general, que es la misma puerta que la tarjeta «Repasar mis
  clases».
- Lo prueban `pruebaProgresoAlumna` y `pruebaUltimaClase` en
  `verificar-panel.js`; volviendo a poner el enlace viejo o el «Ver informes
  completos», saltan.

### La página de coordinación, lo de todos los días primero

El mismo pedido para quien coordina. Su panel (`clases.html`) ya lo tenía desde
«El panel de quien da clase»: el grupo «Coordinación» y, en «Lo urgente», sus
solicitudes y saldos vencidos. Faltaba su pantalla propia, `coordinacion.html`:

- **Las cuentas van primero y Equipos abajo.** Buscar a alguien, corregir su
  ficha, reenviarle el acceso o ver quién está en clase es lo de todos los
  días (la tarjeta del panel que lleva ahí se llama «Cuentas»); Equipos se
  arma de vez en cuando y, arriba, empujaba la lista una pantalla hacia abajo.
  La lista lleva su título, «✏️ Cuentas».
- **Los números sirven para algo.** «Profesores que coordinas» y «alumnos
  alcanzados» filtran la lista de un toque (un número que no lleva a nadie
  obliga a ir a buscarlos). El tercero ya no es «cuentas en total» —la suma de
  los otros dos, un dato repetido— sino **cuántos de su gente están dando
  clase ahora** (sin contar la propia), que es cuando se puede ir a mirar y
  ayudar desde la ficha.
- **«Lo urgente» no se repite acá**: ya está en su panel, que es donde entra.
- Lo prueba `pruebaOrdenYNumeros` en `verificar-coordinacion.js`; volviendo a
  poner la suma, salta.

### Equipos: lo que pide atención primero

La sección Equipos de `coordinacion.html` pintaba cada equipo entero, con sus
etiquetas, sus selectores y el volcado de grupos, uno debajo del otro y en el
orden del nombre. Con varios equipos era una pared, y un equipo **sin
entrenadores** —que no le da acceso a nadie: es una llave sin puerta— se veía
igual que uno que funciona. Además, quien administra tenía dos puertas al mismo
lugar: esta y `admin.html#equipos`.

- **Arriba, cuántos piden atención** («3 equipos · ⚠️ 1 pide atención»), y
  la lista en orden: primero los que les falta algo (sin entrenadores o sin
  alumnos), después los que puede repartir y al final los que tienen gente de
  otra coordinación, que solo se miran. Solo se dice «pide atención» de lo que
  quien coordina puede arreglar.
- **Cada equipo va plegado con su resumen**: nombre, cuántos entrenadores y
  alumnos, y lo que le falta escrito («⚠️ sin entrenadores y sin alumnos»);
  el borde lo marca, pero no va solo. Se abre solo el que pide atención, el
  recién creado o el único que hay. **Lo que se abrió queda abierto** al
  repintar: cada ✕ o cada volcado repinta la lista, y si se volviera a cerrar
  habría que buscar el equipo otra vez.
- **«Nuevo equipo» va al final**: se hace de vez en cuando. El equipo recién
  creado queda abierto y primero (está vacío), que es donde se le ponen sus
  entrenadores.
- **Quien administra no tiene una segunda puerta**: en coordinación la sección
  le dice que los equipos se arman en Administración › Equipos, con el enlace,
  y no se baja ni los equipos ni la lista de todos los alumnos.
- Lo prueban `pruebaEquipos` y `pruebaEquiposAdmin` en
  `verificar-coordinacion.js`: el orden y qué está abierto (medido con
  `checkVisibility()`), el resumen, que lo abierto sigue abierto después de
  volcar, y que a quien administra no se le pinta otra lista.

### Las cuentas se ven por GRUPO, no todas de una

Lo primero que muestra la página son **fichas de grupo**, no la lista de
cuentas: con trescientas, una pared de filas con sus campos editables y sus
etiquetas de profesor no se lee, y encontrar un grupo es hacer scroll. Cada
ficha dice cuánta gente tiene, qué profesores la llevan (con cuántos alumnos de
ese grupo tiene cada uno) y cuántos se quedaron sin profesor. Las cuentas
aparecen solo al **abrir un grupo** o al **buscar a alguien**.

- `grupoAbierto` es lo único que decide qué se ve: `null` son las fichas, y un
  nombre de grupo son sus cuentas. Hay dos grupos que no son un `profiles.grupo`:
  **Sin grupo** (alumnos a los que nadie se lo puso) y **Profesores y
  administración** — el equipo docente no tiene grupo, y mezclarlo con los
  sueltos lo escondía entre ellos.
- **Buscar manda sobre el grupo abierto y mira TODOS los grupos.** Buscar a
  alguien sin saber en qué grupo está es justamente para lo que se busca.
- **Cada ficha puede sumarle un profesor a TODO su grupo de una vez.** Es la
  operación de todos los años ("todo 7° B también al profesor nuevo") y antes
  pedía marcar el grupo entero y bajar a la barra de lote. Va en modo
  **`agregar`**, que suma y no reemplaza: quitarle sin querer un profesor a
  cuatrocientos alumnos es el error caro de esta página. Manda **todos** los
  alumnos del grupo, no los 50 que se estén pintando, y solo alumnos —a un
  profesor no se le asigna profesor—.

### La lista de cuentas, pensada para muchas

- **El nombre se cortaba, y la causa era la maqueta**: nueve columnas dentro de
  un `max-w-5xl` (1024 px). Ahora la página es `max-w-7xl` y **nombre y correo
  van en UNA sola celda**, uno debajo del otro. De paso "Hacer administrador"
  se fue a Acciones (es de una vez cada tanto, no de todos los días) y la corona
  quedó al lado del nombre. Siete columnas en vez de nueve.
- **Buscar, filtrar y mostrar de a poco**, las tres cosas juntas: búsqueda por
  nombre, correo o grupo **sin tildes** (quien escribe "ramirez" tiene que
  encontrar a "Ramírez"), filtro de rol, y 50 filas por vez con "Ver más". Cada
  fila lleva cuatro campos editables y sus etiquetas de profesor: pintar
  trescientas para buscar a una es trabajo tirado.
- El filtro de rol tiene una opción que **no es un rol**: "Sin profesor
  asignado". Es la pregunta que más se hace en esta página —esos alumnos no
  salen en los informes de nadie— y el aviso de arriba ahora los deja a la vista
  de un clic en vez de decir "agrúpalos abajo para encontrarlos".
- **Las cuentas se piden de mil en mil.** Se pedían de un solo tiro, y PostgREST
  corta la respuesta a partir de cierta cantidad de filas **sin dar ningún
  error**: el día que la plataforma pase de mil cuentas, el panel habría
  empezado a esconder cuentas en silencio, y los conteos de alumnos por profesor
  habrían salido calculados sobre un pedazo. Es la misma piedra de
  `informes.html`, con el mismo `traerTodo()`.

**Al tocar `admin.html` o `inscripciones.html`, correr `node
herramientas/verificar-admin.js`** (con el sitio en localhost:8777 y
playwright). Las dos están detrás del login, así que `verificar-css.js` no las
ve. Su Supabase de mentira trae **1.205 cuentas a propósito**: es el único
número con el que se nota si la página se las pide de una sola vez. Y mide el
ancho del campo del nombre con un nombre largo de verdad, que es con lo que
empezó todo esto. Comprueba además que al entrar **no se pinte ni una fila** —si
alguien vuelve a mostrarlas todas, la página se ve igual de bien hasta que hay
trescientas— y qué manda de verdad la ficha a la Edge Function al sumarle un
profesor a un grupo (los 401 ids y el modo `agregar`, no medio grupo ni un
`reemplazar`). Del volcado en un equipo comprueba que se ofrezcan los grupos y
los subgrupos —con el dueño de cada subgrupo escrito—, que **un grupo que no
cabe en el tope no se mande** y se diga con su número, y que el que sí cabe se
sume al que ya estaba en vez de reemplazarlo.

### «Actualizaciones»: lo que se le ha hecho al sitio, sin escribirlo a mano

`novedades.html` (ficha «🗂️ Actualizaciones» en el grupo «La plataforma» de
`admin.html`, solo `is_admin`) es la lista de todos los cambios que entraron a
`main` desde el primer commit, agrupados por día, con buscador sin tildes y el
número de cada PR enlazado.

- **Sale de la historia de git, no de una bitácora aparte.** Una bitácora
  escrita a mano se queda atrás a la primera tanda que se olvide de anotarse, y
  nadie se entera. La arma `node herramientas/novedades-generar.js` en
  `data/novedades.json` (con `--first-parent` y la fecha en que el cambio
  ENTRÓ a `main`); en una copia superficial pide antes `git fetch --unshallow
  origin main`. **Al terminar una tanda, volver a correrlo** — el propio PR
  que lo corre no sale todavía, sale en el siguiente.
- **Solo títulos, nunca el cuerpo.** El archivo queda servido como cualquier
  otro y los cuerpos de los PR explican el modelo de permisos por dentro, que
  es justo lo que `.assetsignore` saca del despliegue.
- Los títulos se pasan por el mismo corrector de `verificar-voseo.py` (que por
  eso ahora se puede importar sin que barra el sitio): se pintan en el sitio,
  y alguno viejo traía voseo. La historia de git no se toca.
- `node herramientas/verificar-novedades.js` comprueba el archivo (sin hashes
  repetidos, sin «Merge pull request», en orden) y la página: un grupo por día,
  el título ajeno literal, el buscador sin tildes y que a quien no administra
  no se le pinte.

## La preparación de rivales

`preparacion-rivales.html`: un profesor carga un PGN con partidas de un rival
(de Lichess, Chess.com o de donde sea) y la página arma el análisis completo:
cuánto saca con cada color, por ritmo, por año y según el Elo del oponente; su
repertorio; las líneas donde rinde menos y más; el FODA; qué jugarle con
blancas y con negras; y la revisión de todo eso con Stockfish. Nació de
preparar a mano la partida contra Oscar a partir del libro del bot: se pidió
lo mismo para cualquier rival, activable profesor por profesor desde
administración.

**Quién puede lo decide la base.** `puedo_preparar_rivales()` dice que sí a
quien administra y a los profesores que están en
`preparacion_rivales_profesores`. Esa tabla no tiene política de escritura: la
escribe `activar_preparacion_rivales()`, que exige administrar, exige que la
cuenta sea de un profesor y **devuelve cómo quedó**, leído de la tabla. El
interruptor de `admin.html#preparacion` (`js/admin-preparacion.js`) pinta eso,
no lo que se pidió. La tarjeta del panel del profesor (grupo «Tus clases» de
`js/clases.js`) sale solo si la función dice que sí; mirando el panel de otra
persona («Ver como» una persona) se pregunta por esa persona y no por quien
mira.

**El PGN no sale de la computadora.** Se lee con `FileReader` y se analiza en
el navegador; lo que se guarda (`preparaciones_rival.analisis`) es el
resultado, que pesa unos pocos KB aunque el PGN tenga 30.000 partidas. Lo ve
su dueño y quien administra. Guardar exige tener la función activa (política
de `insert`); si administración la apaga, lo guardado se sigue viendo y
borrando, pero no se guarda nada nuevo. Se comprobó en SQL impersonando cada
rol: un profesor sin activar no guarda ni se activa solo, uno
activo no guarda a nombre de otro ni ve lo de otro, y `anon` no ejecuta nada.

**Las cuentas viven en `js/preparacion-analisis.js`, sin pantalla**, para que
las pruebe Node sin navegador. Decisiones que no se ven:

- **El árbol se arma por posición** (desde la etapa 1; antes, por secuencia):
  1.d4 Cf6 2.c4 e6 y 1.c4 e6 2.d4 Cf6 son el mismo nodo y cuentan juntas. Ver
  «La base de la preparación: etapa 1».
- **Nada se decide con pocas partidas.** Una línea cuenta desde `minimo()`
  partidas (el 1 % del archivo, entre 4 y 30). Para elegir qué jugarle, la
  puntuación se «encoge» hacia su promedio con 8 partidas imaginarias: 3 de 3
  no es 100 %. Una línea es fuerte o débil cuando se aparta de su promedio con
  ese color más de lo que explica el azar (z de ±1,28 y al menos 5 puntos). La
  comparación es contra su promedio **con ese color**: saca menos con negras
  que con blancas, y eso no convierte cada línea con negras en un punto débil.
- **Del mismo rival hay nombres escritos de varias formas.** «Angulo, Oscar»,
  «Oscar Angulo» y «ÓSCAR ANGULO» son la misma persona (`claveNombre()`: sin
  tildes, sin mayúsculas, palabras ordenadas). Se muestra la forma que más se
  repite en el archivo.
- **El plan sigue hasta el fondo toda apertura que el rival juega una de cada
  cuatro veces o más**, no solo la más jugada. Con la más jugada nada más, a un
  rival que abre 1.e4 y 1.d4 se le preparaba una sola: su 4.Dh4 de siempre
  después de 1.d4 c5 (el error que Stockfish le encontró a Oscar) nunca llegaba
  al motor.
- **Stockfish revisa las jugadas de los planes, las suyas y las nuestras**
  (`tareasDelMotor()`, hasta 30, primero las más jugadas). Si una jugada
  habitual del rival pierde medio peón o más, es un error que se le puede
  preparar y va a Oportunidades. Si una recomendación nuestra pierde un peón o
  más, va a Amenazas: los números premian una jugada mala cuando él no la supo
  castigar (en el primer informe sobre Oscar, la receta contra el Englund
  recomendaba 5.Dd2, que pierde la torre). Se puede parar a la mitad, y lo
  revisado se muestra igual.
- **El motor es Stockfish 19 lite, solo en esta página.** Stockfish 19 (setiembre
  de 2026) es el motor público más fuerte. Su versión completa para navegador
  pesa 94 MB —Cloudflare no publica archivos de más de 25 MB, y nadie espera
  esa descarga—, y las de varios hilos exigen las cabeceras de aislamiento
  (COOP/COEP), que romperían las fuentes, los videos y el tablero de Lichess
  incrustados. Queda la **lite de un hilo** (1,7 MB, red neuronal más chica):
  la que su autor recomienda para casi todo. Son los archivos del paquete de
  npm `stockfish` 19.0.0 (el de Nathan Rugg, el que usa Chess.com), sin tocar,
  en `js/vendor/stockfish/`; el verificador los compara por su huella. No está
  en `package.json` a propósito: el paquete trae también la versión completa y
  pesa 200 MB, que el CI bajaría en cada corrida.
  - **La pide la página con `data-motor`** en el `<script>` de
    `js/shared-engine.js`. El resto del sitio sigue con Stockfish 16: el nivel del
    bot «Juega contra mí» (`OSCAR_ELO_CALIB`) está calibrado con ese, y cambiarle
    el motor le movería la fuerza sin que nadie se entere.
  - **Profundidad 18.** En una computadora de escritorio tarda entre medio
    segundo y uno por posición, y el análisis de prueba entero se revisó en 13
    segundos. Encontró solo el 4.Dh4 plantado (+0,08 → −0,57).
- **Todo sale en notación española** (`sanEs()`) y los porcentajes con coma.

### Bajar las partidas de Lichess o Chess.com

Buscar el PGN de un rival en su perfil, exportarlo y cargarlo era el paso que
más costaba. Ahora se escribe su usuario de Lichess o de Chess.com, se elige
cuántas partidas (las últimas 500, 2000, 5000 o todas) y la página las baja,
elige a ese usuario como rival y analiza sola (`js/preparacion-descarga.js`).

- **Directo desde el navegador**, sin pasar por el worker ni por Supabase: las
  dos APIs son públicas, sin clave y con CORS abierto. Por eso `_headers` las
  tiene en `connect-src` (`lichess.org` ya estaba por las transmisiones;
  `api.chess.com` entró con esto). Sin esa línea la descarga funciona en la
  máquina de prueba —que no manda `_headers`— y falla en producción sin
  explicar nada: `verificar-preparacion-rivales.js` lee la política.
- **Solo sale el nombre de usuario**, y las dos están en la lista de
  proveedores de `privacidad.html` (ver «Las páginas legales»).
- **Lichess** entrega todo en un solo flujo, las más nuevas primero, a unas 20
  partidas por segundo sin cuenta: se lee de a pedazos para ir diciendo cuántas
  van. Se piden **con relojes** (desde la etapa 1: dicen cómo usa el tiempo) y
  sin evaluaciones ni nombre de la apertura, que el análisis no usa y hacen más
  pesado el flujo.
- **Chess.com** guarda las partidas por mes: se pide la lista de meses y se
  baja uno por vez, del más nuevo al más viejo, hasta juntar las pedidas. De a
  uno a propósito: Chess.com pide no hacer pedidos en paralelo y contesta 429.
- **Se puede parar**, y se analiza lo que ya llegó, sin la última partida si
  quedó a medias.
- Un usuario que no existe, un 429 o un error del sitio se dicen en palabras
  en la página; no van a la consola como error, porque no lo son.
- **No es solo de la preparación**: «Tus propios errores» (Tipos de
  entrenamiento) usa este mismo descargador y `leerPgn()` para traer las
  partidas del propio alumno (ver «El tipo 18: Tus propios errores» en
  entrenamiento.md). Un cambio acá cambia las dos cosas.
- `esFinal()` y `tipoDeFinal()` viven en `preparacion-posiciones.js` (los
  usa también «Tus propios errores» para los errores del final), y el
  análisis los toma de ahí al cargar: sin posiciones cargado antes, el
  análisis no arranca (el trabajador ya lo cargaba en ese orden).

Lo prueba `verificar-preparacion-rivales.js`, en dos partes. Sin navegador,
con un PGN de patrones plantados (dónde pierde, dónde gana, dónde improvisa, un
nombre escrito de tres formas, comentarios, variantes anidadas y NAG): que se
lean todas, que el rival sea uno solo, que el análisis encuentre lo plantado y
que el motor marque el error sembrado. En un navegador, con un Supabase de
mentira y un Stockfish de mentira (castiga la dama blanca en h4): sin la función
se ve el aviso y no la herramienta; con ella se carga el archivo, se analiza, se
ve cada parte en su orden, el motor marca 4.Dh4, se guarda el resultado sin el
PGN, borrar pide confirmar, y un nombre con marcado queda como texto. La
descarga se prueba con un Lichess y un Chess.com de mentira (con CORS, como los
de verdad): qué se les pide, en qué orden, que corte en el tope y que un usuario
que no existe se diga. La
sección de administración la prueba `verificar-admin.js` y la tarjeta del panel
`verificar-panel.js`.

### Prepárate tú: el alumno se prepara solo

En `plan-rival.html`, sin `?id=`, arriba de los planes que le mandó el profe,
está **«Prepárate tú contra tu próximo rival»**: el usuario de Lichess o
Chess.com del rival y con qué color va a jugar. Se entra también desde
Competir («Prepara tu próxima partida»).

- **Es la misma preparación, con lo mismo.** Las partidas se bajan con
  `PreparacionDescarga` (las últimas 300), se analizan con
  `PreparacionAnalisis.analizar()` y el plan sale de `planDelAlumno()`: lo
  mismo que le llega cuando se lo manda el profe. Por eso se pinta con
  `pintarPlan()`, se entrena con `montarEntrenamiento()` y se juega con
  `montarSparring()`, sin una segunda copia de nada. Los cuatro módulos que el
  plan del profe no necesita (táctica, estructuras, análisis y descarga) se
  cargan solo al apretar «Preparar mi plan».
- **Solo ajedrez normal desde la inicial** (como «Tus propios errores»): una
  partida de Chess960 o «desde posición» no entra.
- **El plan queda en el navegador para compararlo después** con la partida
  del torneo (`plan_propio_guardados_v1`, los últimos 8, solo el árbol; ver
  «La partida contra lo que había preparado» en entrenamiento.md).
- **No se guarda en la base ni sale del navegador.** A Lichess o Chess.com solo
  se les manda el usuario del rival (está en `privacidad.html`), y el último
  rival y color quedan en `localStorage` para la próxima vez, como comodidad.
  El entrenamiento de las líneas sí queda en `training_progress`, como el de
  un plan del profe, con el id `propio:<sitio>:<usuario>:<lado>`: así el
  repaso espaciado encuentra las líneas la próxima vez que prepare al mismo
  rival con el mismo color.
- **A todos, sin activar nada.** La preparación del profesor la activa
  administración porque es una herramienta de trabajo con su análisis
  guardado; esta es una consulta del alumno a partidas públicas, que no
  guarda nada.
- Arriba del plan, **«Lo que juega»** en palabras: cuántas partidas y de
  cuándo, cuánto saca con cada color, su Elo y, del lado que le toca, sus
  jugadas más repetidas. Con pocas partidas lo dice. Si con ese color juega
  muy poco para un plan, lo dice y no pinta nada.
- Lo prueba `verificar-preparacion-rivales.js` (`pruebaPropio`) con el mismo
  Lichess de mentira: el usuario inválido no se pide, el que no existe se
  dice, a Lichess solo va el usuario con el tope de 300, el plan con blancas y
  con negras, «Lo que juega», que se puede entrenar, que no se inserta nada
  del plan ni del análisis y que el formulario recuerda al último rival.

### La base de la preparación: etapa 1

Se pidieron siete mejoras (cruzar con las partidas del alumno, dónde se sale de
la teoría, cómo pierde, sus finales, un tablero para recorrer las líneas,
mandárselo al alumno y entrenar el repertorio), más los filtros. Casi todas
dependen de cosas que no existían, así que van por etapas, un PR cada una, y
la primera es la base:

- **El árbol por posición.** `js/preparacion-posiciones.js` saca la clave de la
  posición después de cada jugada (la misma de `js/chess-bot.js`: colocación,
  turno, enroques y al paso a la manera de chess.js 0.10.3). chess.js lo sabe,
  pero tarda 365 µs por jugada porque genera todas las legales para leer cada
  SAN: con 30.000 partidas, casi un minuto. Esto solo aplica la jugada escrita
  —busca la pieza que llega; si hay dos y el SAN no dice cuál, descarta la
  clavada— y tarda 0,3 µs. Se comparó contra chess.js en 29.476 posiciones al
  azar sin una diferencia; el verificador repite 40 partidas al azar y dos de
  verdad con lo que el azar casi no trae (una captura al paso y un caballo
  clavado cuya jugada va sin desambiguar).
- **Nodo y arista no son lo mismo.** Cada nodo (posición) cuenta todas las
  partidas que pasaron por ahí, por cualquier orden; cada arista (una jugada
  desde esa posición) cuenta las que la jugaron AHÍ. Para elegir qué jugarle se
  usa la posición (más partidas, la misma posición); para decir «él la juega el
  63 % de las veces», la arista. Usar el nodo para el reparto daba más del 100 %
  cuando a la posición se llegaba por otro lado.
- **Los filtros por ritmo y fecha**, sobre el análisis ya hecho: ritmos (los
  que el rival tiene, con cuántas partidas cada uno) y desde cuándo (todas, el
  último año, los últimos 2 o 5). Cambiarlos vuelve a analizar al instante, sin
  volver a leer ni a bajar nada: las partidas se quedan en el trabajador. Con
  menos de 30 avisa que dice poco; si no pasa ninguna, lo dice y no pinta un
  análisis vacío. En un análisis guardado no se pueden cambiar (las partidas no
  se guardan): la página lo dice.
- **Más datos de cada partida**, para la etapa 2: cómo terminó (tiempo,
  abandono, mate, tablas, ahogado, repetición, material, abandonada; «stalemate»
  también dice «mate» y va antes), todas las jugadas y los relojes (`[%clk]` de
  Lichess y Chess.com, en segundos por jugada). No se guardan en el análisis:
  viven con las partidas, en el trabajador.
- **Las cuentas, en segundo plano** (`js/preparacion-trabajador.js`, un Web
  Worker): con miles de partidas la página se congelaba unos segundos. Si el
  navegador no deja crear el trabajador, las mismas funciones corren en la
  página.
- **Una «línea», una sola copia** (`js/preparacion-lineas.js`): la notación
  española, la evaluación escrita, la posición para el motor y **el plan en
  PGN**, con sus ramas como variantes y en cada jugada cuánto saca él y lo que
  dijo Stockfish. Es lo que van a usar el tablero, la tarea, la clase en vivo y
  el entrenamiento. Por ahora se baja con «Bajar el plan con blancas (PGN)».
- **La página en módulos**: `js/preparacion-rivales.js` (el recorrido),
  `js/preparacion-pintar.js` (dibujar) y `js/preparacion-motor.js` (Stockfish).
- **Los análisis guardados antes siguen abriéndose.** El resultado lleva
  `version` (2 desde esta etapa); la página pinta lo que haya y no pide lo que
  una versión vieja no tenía. El verificador abre uno de la versión 1.

### Más allá de la apertura: etapa 2

Una tarjeta nueva, «Más allá de la apertura», con lo que el rival hace después
de la teoría (`masAllaDe()` en `js/preparacion-analisis.js`):

- **Cómo terminan sus partidas**: sus derrotas y sus victorias por tiempo,
  abandono, mate o abandonando la partida. Sale de la etiqueta `Termination`
  (ver «La base de la preparación: etapa 1»).
- **Cuándo pierde**: en la apertura (partidas de hasta 20 jugadas), en el medio
  juego, o en el final si ya había entrado en uno.
- **El reloj**, solo con las partidas que traen `[%clk]` y cuyo ritmo se conoce.
  Todo va en proporción del tiempo inicial de cada partida, porque un archivo
  mezcla bullet con rápidas: cuánto le queda en la jugada 20 y en la 40, cuánto
  gasta en las primeras 15 (contra lo que gastan sus rivales en las mismas
  partidas) y en qué parte de las partidas se queda con menos del 10 %. Son
  medianas: una partida abandonada en la jugada 3 no mueve nada. Sin relojes, la
  tarjeta lo dice en vez de inventar.
- **Sus finales.** Una partida entra en un final cuando cada lado tiene 13
  puntos de piezas o menos (sin peones) y dos piezas como mucho: torre y alfil
  contra torre es un final; dama y torre contra dama, no. Se mira después de
  cada captura o coronación, con `js/preparacion-posiciones.js`, y se guarda en
  la partida **por color** (la ventaja es la del rival, y del mismo archivo se
  puede analizar a los dos jugadores). El tipo sale de las piezas que quedan:
  de peones, de torres, de damas, de alfiles de distinto o del mismo color, de
  caballos, de alfil contra caballo, de piezas menores, de torre y pieza menor,
  o con dama y otras piezas. La **conversión** mira la ventaja de material al
  entrar en el final (2 puntos o más): cuántas ganó con ventaja y cuántas salvó
  con desventaja.
- **Al FODA** entra lo que se aparta de verdad, con los mismos umbrales de las
  líneas: derrotas por tiempo (25 % o más) y la oportunidad de apretar el reloj;
  derrotas con mate; derrotas que se deciden en la apertura (40 % o más: la
  preparación rinde); apuros de tiempo (30 % o más); si gasta más tiempo que sus
  rivales en la apertura (10 puntos o más); los tipos de final donde rinde menos
  o más que su promedio, con su «busca» o «evita»; y si le cuesta convertir o se
  defiende bien.

El verificador comprueba los tipos de final con posiciones armadas a mano; el
momento y la ventaja al entrar en un final, contra un cálculo aparte con el
tablero de chess.js en 60 partidas al azar; y cómo pierde y el reloj con 20
partidas de relojes y resultados conocidos, incluido lo que dice el FODA.

### Ver las líneas en un tablero: etapa 3

Cada jugada del plan de «Qué jugarle» es un botón: abre un tablero («En el
tablero», arriba del resultado) en la posición de esa jugada, con la línea
hasta ahí y, por delante, la continuación principal del plan hasta donde
llegue (`lineaDelPlan()` en `js/preparacion-lineas.js`). Cada error que marcó
Stockfish trae también su «Ver», que abre la línea en la jugada del error.

- **El tablero es `js/visor-linea.js`**, que se recorre con ⏮ ◀ ▶ ⏭, tocando
  una jugada de la lista, con el teclado (`js/tablero-accesible.js`: una sola
  parada de tabulador y flechas por las casillas) y escribiendo en el cuadro de
  comandos del Modo Adaptado («siguiente», «anterior», «jugada 5»,
  «evaluación», o una pregunta como «caballos»). En cada paso se lee **la
  jugada contada** («El caballo blanco va de…»), no la posición entera: esa
  queda escrita aparte, en «La posición, pieza por pieza». Son las mismas
  decisiones del tablero de Estudio (ver «Estudio: el tablero de una ficha era
  decoración»), y por eso **`js/ficha-render.js` toma de `js/visor-linea.js`**
  cómo se pinta una pieza, cómo se cuenta una jugada y cómo se recorre
  escribiendo: antes esas tres cosas eran de Estudio y se habrían copiado.
- **Debajo de cada jugada, su nota**: cuánto la juega él y cuánto saca, y lo
  que dijo Stockfish si la marcó. Es el mismo texto que va en los comentarios
  del PGN del plan (`notaJugada()`), una sola copia.
- **Stockfish evalúa la posición que se ve** (el mismo 19 lite de la revisión,
  `PreparacionMotor.evaluar`), una vez por posición: volver a una jugada no lo
  vuelve a pedir. Si la revisión está corriendo, la evaluación espera su turno
  en la misma cola del motor. Sin motor, ese renglón de la evaluación no se
  muestra.
- **Una jugada que no se puede hacer corta la línea ahí**: el tablero nunca
  muestra una posición que no sale de las jugadas.
- El foco va al título del tablero al abrirlo y vuelve al botón que lo abrió al
  cerrarlo. Un análisis nuevo (otro rival, otros filtros) lo cierra, porque
  mostraba una línea del anterior.
- **Cada casilla es cuadrada por sí misma** (`aspect-ratio` en la casilla, no
  filas de `1fr` en un tablero cuadrado): así, en el celular, una fila sin
  piezas se aplastaba.

El verificador abre el tablero desde una jugada del plan y desde un error de
Stockfish, y comprueba la posición, la jugada contada, la nota, la evaluación
del doble del motor, los botones, lo escrito, las flechas, el foco al cerrar y
que una jugada ilegal corte la línea.

### Mandar el plan al alumno y a la clase: etapa 4

Debajo de cada plan de «Qué jugarle» van tres botones: bajarlo en PGN,
**«Mandárselo a un alumno»** y **«Guardar en Archivos (para la clase)»**.

**Al alumno le llega SOLO EL PLAN.** El análisis entero (FODA, repertorio,
dónde rinde menos, la revisión de Stockfish) sigue en `preparaciones_rival`, que
el alumno no ve nunca. Lo que viaja es `planDelAlumno()`
(`js/preparacion-lineas.js`): el árbol de jugadas de un lado, con sus números, y
lo que dijo Stockfish **de esas jugadas** y de ninguna otra. Desde «Juega contra
él» viajan también su libro con el color que lleva en ese plan y su Elo (ver
«Juega contra él»): son sus jugadas y cuántas veces las hizo, nada del análisis.

- **Por qué una tabla aparte, `planes_rival_alumno`, y no abrirle al alumno la
  fila del análisis:** la RLS es por fila, no por pedazo de un `jsonb`. Una
  política que dejara al alumno leer «la parte del plan» de
  `preparaciones_rival` le dejaría leer la fila entera. Así que el plan se
  **copia**. Es una foto, como el acta de un examen: si el profesor vuelve a
  analizar al rival, el alumno sigue con el plan que le mandaron.
- **Quién ve un plan mandado:** el alumno a quien se lo mandaron, el profesor que
  lo mandó y quien administra.
- **Quién manda:** quien tiene la preparación activa (`puedo_preparar_rivales()`),
  y solo a **sus** alumnos (`soy_profesor_de()`); quien administra, a cualquier
  alumno, con el mismo alcance que ya tiene en Tareas.
- **Nadie lo edita** (no hay política de `update`): para corregirlo se manda
  otro. Lo borran quien lo mandó y quien administra.
- **Mandar es UNA llamada**, `mandar_plan_rival()`, `SECURITY INVOKER`: por
  cada alumno, el plan y su tarea (con `crear_tarea()`, la misma de
  `tareas.html`). La tarea tiene un solo renglón `completar` que abre
  `plan-rival.html?id=…`. Partido en dos, si la tarea fallaba quedaba un plan
  que no le avisó nadie, o una tarea que apunta a un plan que no existe. El aviso
  al celular sale solo, del trigger de las tareas.
- La lista de alumnos es la de `profiles` que la RLS le deja ver al profesor,
  con el mismo selector de subgrupos de Tareas y Exámenes
  (`js/subgrupos-marcar.js`). **Quién es alumno de quién lo decide la base, no
  la lista**: a una cuenta ajena, la función contesta «no es alumno tuyo».
- Comprobado impersonando roles en SQL, 21 casos:
  - un profesor sin la función activa no puede mandar;
  - con ella, no puede mandar a un alumno ajeno (ni con la función ni con un
    insert directo) ni a nombre de otro profesor;
  - el alumno ve su plan y ningún análisis; no inserta, no borra y no edita;
  - otro alumno no ve nada;
  - quien administra ve todo y manda a cualquier alumno, pero no a un profesor;
  - `anon` no lee la tabla ni ejecuta la función;
  - un plan vacío o una fecha vencida se rechazan.

**`plan-rival.html` es la página del alumno.**
- Muestra el plan con la misma lista de jugadas del profesor
  (`PreparacionPintar.plan()`) y el tablero de la etapa 3, que arranca en la
  línea principal. También deja bajar el plan en PGN y trae la nota del profe.
- Sin `?id=`, lista los planes que le mandaron.
- Lleva `js/tarea-en-curso.js`, así que al entrar desde la tarea se ve la
  franja con lo que falta.
- **No carga Stockfish para el plan.** Lo que dijo el motor de cada jugada ya
  viene en su nota, y bajar un motor de varios megas en el celular del alumno
  para eso no se justifica. Solo lo baja «Juega contra él», y solo cuando la
  partida se sale de lo que el rival juega.

**A la clase se llega por Archivos.** «Guardar en Archivos» guarda **cada
línea del plan como su propio PGN** en `archivos_pgn` (los mismos de
`partidas.html`), en la carpeta «Preparación: <rival>». Así aparece sola en el
panel 📁 Archivos de `sesion.html`, sin tocar la clase en vivo.
- Va una fila por línea y no el plan entero porque la clase carga una partida a
  la vez. El título de cada fila dice la línea («Con negras · 1.e4 e6 2.d4 d5
  3.Cc3 Cf6»), y el PGN lleva las notas de cada jugada como comentarios.
- **Guardarlo otra vez reemplaza** lo de antes, después de preguntarlo: se
  inserta lo nuevo y DESPUÉS se borra lo viejo, así un error a medio camino no
  deja la carpeta vacía.
- Cada línea en PGN sale de `lineaAPgn()`, que arma un plan de una sola rama y
  se lo pasa a `planAPgn()`. Así no hay una segunda forma de escribir el PGN.

El verificador comprueba, sin navegador:
- que lo que se manda sea solo el plan y el motor de sus jugadas, sin perder
  ninguna;
- que cada línea en PGN la lea chess.js y llegue a su última jugada.

Y en la página:
- los tres botones;
- la caja de mandar: foco, solo cuentas de alumno, la fecha puesta y el aviso
  si no hay nadie marcado;
- la llamada única, sin nada del análisis;
- una fila de Archivos por línea, con su PGN, su jugada final y su carpeta, y
  que guardar otra vez reemplace;
- la página del alumno: el plan, el tablero, la nota, el PGN, la lista y un plan
  que no está.

Comprobado que falla al colar el FODA en lo que se manda y al no borrar las
líneas viejas.

### Dónde deja la teoría: etapa 5

Una tarjeta nueva, **«Dónde deja la teoría»**. Toma sus líneas más jugadas,
con cada color, y las compara jugada por jugada con las partidas de maestros
del explorador de Lichess. La línea deja la teoría en la primera jugada que los
maestros jugaron **menos de 5 veces** en esa posición.
- Si esa jugada es **suya**, ahí improvisa o trae algo propio, y es la posición
  que conviene estudiar. Eso va al FODA como oportunidad, con lo que juegan los
  maestros ahí.
- Si la juega **su rival**, él salió de libro sin tener que decidir nada.
- Una línea que sigue a los maestros hasta la jugada 8 o más va al FODA como
  fortaleza: «conoce la teoría».

**Las líneas salen del análisis**, en `repertorioLineas`
(`lineasDeSuRepertorio()` en `js/preparacion-analisis.js`):
- donde le toca a él, las jugadas que hace una de cada cinco veces o más (dos
  como mucho);
- donde le toca al otro, las respuestas de una de cada siete o más (tres como
  mucho);
- todo con el mínimo de partidas del análisis y hasta 20 medias jugadas, diez
  líneas por color;
- cada línea guarda cuántas de sus partidas jugaron cada jugada (`veces`), así
  el FODA dice el número exacto de la jugada donde deja la teoría.

El resultado pasó a la **versión 4**. Un análisis guardado antes no trae las
líneas, y la página dice que hay que volver a analizar.

**El explorador exige un token, así que no se llama desde el navegador.**
Desde 2026, `explorer.lichess.org` contesta **401 sin token**. Se comprobó
desde la base con `pg_net`, porque desde el entorno de desarrollo Lichess está
bloqueado.
- Un token en la página es un token publicado. Por eso lo llama la Edge
  Function **`explorador-maestros`**, con el token en el secreto
  **`LICHESS_TOKEN`**: un token personal sin ningún permiso marcado.
- Sin el secreto, la función contesta `motivo: "sin_token"` y la página lo
  explica en vez de pintar una tarjeta vacía.
- **No es un proxy abierto:**
  - solo pide `/masters`;
  - solo con algo que tiene la forma de un FEN (se valida con una expresión
    regular);
  - solo para quien puede preparar rivales: la función le pregunta a
    `puedo_preparar_rivales()` con la sesión de quien llama. Comprobado desde
    la base: sin sesión da 401, y con la clave anónima, 403.
- **Caché, `explorador_maestros_cache`:**
  - guarda lo que contestó Lichess por posición, con los cuatro campos del FEN
    que dicen qué posición es, así los contadores de jugadas no parten la
    caché;
  - vale 180 días: la base de maestros crece despacio y la misma apertura la
    consultan todos los profesores;
  - no tiene políticas y se revocan todos los permisos: solo la usa el service
    role.
- **Cada pedido cuenta, así que se pregunta por vueltas**
  (`PreparacionTeoria.pendientes()`). En cada vuelta va, de cada línea, solo la
  primera posición sin respuesta, y solo si todas las jugadas anteriores son
  teoría. Lo que viene después de una salida no se pregunta nunca.
- La función pide de a una, se para con el primer 429 y dice por qué paró
  (`sigue`, `limitado`, `token_invalido`, `error`). La página muestra lo que
  alcanzó y dice qué faltó.

**Lo que se le manda a Lichess son posiciones de ajedrez**, sin nombres ni
ningún dato de nadie, y desde el servidor. La política de privacidad lo dice en
el renglón de Lichess, que ya estaba en la lista de proveedores.

**El FODA se arma entero en `foda()`**, incluidos los avisos de Stockfish
(`fodaMotor()`) y los de la teoría (`fodaTeoria()`). Antes, `aplicarMotor()`
los agregaba después de armarlo. Con la teoría llegando por su lado, cualquiera
de las dos que volviera a armar el FODA habría borrado lo de la otra, sin dar
ningún error. De paso, los avisos del motor quedaron en su orden: antes, el
cuarto error salía primero.

El verificador trae un «libro de maestros» de mentira con las cuentas por
posición. Comprueba, sin navegador:
- las líneas del repertorio y sus `veces`;
- que por vueltas no se pregunte nada dos veces ni después de una salida;
- quién deja la teoría y dónde (1.d4 c5 2.Cc3 la deja él, con 0 de 100; 3.e5
  Cf6 la deja su rival);
- que la Española con negras sea teoría hasta el fondo;
- el FODA;
- que sin respuestas no se invente ninguna salida.

Y en la página, con un doble de la función:
- la tarjeta después de la de Stockfish, con sus filas;
- «Ver» en el tablero, con lo que dicen los maestros;
- el FODA con los dos avisos;
- que se guarde con la teoría;
- el aviso cuando falta el token.

Comprobado que falla al preguntar posiciones después de una salida y al sacar
la teoría del FODA.

### Cruzar con las partidas del alumno: etapa 6

El análisis dice qué jugarle al rival; el alumno que lo va a enfrentar tiene su
propio repertorio. **«Cruzarlo con tu alumno»** trae las partidas del alumno
(con su usuario de Lichess o Chess.com, o un PGN) y arma la tarjeta **«Tu
alumno contra él»**. Para cada color dice dos cosas:

- **El plan, ¿ya lo juega?** Mira cada jugada del plan que le toca al alumno:
  - «la juega»: es su jugada de siempre ahí, o la hace la mitad de las veces o
    más;
  - «juega otra cosa»: con cuál y cuántas veces, con su «Ver» en el tablero;
  - «no llegó»: tiene menos partidas que el mínimo en esa posición.

  El resumen solo nombra lo que no es cero.
- **Lo suyo, ¿le sirve?** Busca las posiciones a las que llegan los dos en sus
  propias partidas. En cada jugada del alumno, compara cuánto saca el rival
  contra ella con su promedio con ese color, suavizado como en el análisis.
  - Cinco puntos menos o más: **«juega lo suyo: ahí él rinde menos»**. Es
    mejor que el alumno juegue lo que ya sabe que aprenderse el plan de cero.
  - Cinco puntos más o más: **«ojo: ahí él rinde más»**.
  - Si no llegan a ninguna posición en común, lo dice aparte: no es lo mismo
    que «rinde como siempre».

**Cómo se cuenta** (`js/preparacion-cruce.js`):
- El árbol del alumno se arma igual que el del rival: `armarArbol()` del
  análisis, por posición, con las transposiciones juntas. Para eso el análisis
  expone sus piezas en `PreparacionAnalisis.interno`: una sola forma de armar
  y contar el árbol.
- El mínimo del alumno es el 1 % de sus partidas, entre 2 y 10: un alumno
  trae muchas menos que un rival de Lichess. El del rival es el del análisis.
- El cruce baja por los dos árboles a la vez, solo por jugadas que los dos
  tienen con su mínimo, hasta 14 medias jugadas. La misma línea con una jugada
  más no se repite, con el criterio de «Dónde rinde menos».

**En la página:**
- **Corre en el trabajador en segundo plano.** Las partidas del alumno se
  guardan aparte de las del rival, así leerlas no borra nada. Se cruzan con
  las partidas del rival que pasan los mismos filtros del análisis que se ve,
  y al cambiar los filtros se vuelve a cruzar solo.
- Al alumno no se le aplican los filtros: sus partidas son todas las que trajo.
- **Un análisis guardado no trae las partidas del rival**, solo el resultado.
  Si el trabajador tiene las de otro rival, cruzar diría cualquier cosa sin
  dar ningún error. Por eso se exige que el rival cargado sea el del análisis
  que se ve, y si no, se pide volver a cargarlas.
- Si el usuario bajado aparece en las partidas, se elige solo y cruza de una
  vez. Si no, o si es un PGN, se elige en la lista.
- El cruce queda en `r.cruce` y se guarda con el análisis.

El verificador trae una alumna de mentira. Con blancas juega 1.e4 e5 2.Cf3 Cc6
3.Ac4 (el plan dice 3.Ab5) y 1.d4 d5 2.c4, donde el rival saca 90 %; contra su
1.e4 saca 24 %. Con negras contesta 1.d4 con c5, lo que dice el plan.

Sin navegador comprueba:
- las partidas por color;
- qué jugadas del plan ya juega, dónde se aparta y qué no alcanzó;
- «juega lo suyo» y «ojo»;
- que con filtros que dejan al rival sin partidas no invente encuentros;
- que un alumno que no está en el archivo dé `null`.

En la página comprueba:
- la descarga por usuario y el cruce solo;
- la tarjeta, con el resumen sin ceros;
- «Ver» en el tablero;
- que se guarde con el cruce;
- que otros filtros vuelvan a cruzar;
- que un análisis guardado de otro rival no se cruce.

Comprobado que falla al quitar el volver a cruzar y al quitar la comprobación
del rival.

### Entrenar el plan: etapa 7

En `plan-rival.html`, debajo del plan, va **«Entrénalo»**: el alumno juega cada
línea del plan **de memoria**. Él mueve sus piezas y el tablero mueve las del
rival, con una pausa, diciendo qué jugó y la nota de esa jugada.
- Una jugada legal que no es la del plan se deshace y cuenta como error.
- «Pista» dice la jugada y marca de dónde sale.
- **La nota la pone lo que pasó, no el alumno**, como en Aperturas: una línea
  queda sabida cuando sale **sin errores y sin pistas**.
- Se juega con clic, con el teclado (`js/tablero-accesible.js`) y
  escribiendo en el cuadro del Modo Adaptado («c5», «Cf3», «pista»).
- Con negras, el tablero se da vuelta y el rival abre solo.

**El entrenador es `js/entrenador-linea.js`**, un módulo, y toma de
`js/visor-linea.js` cómo se pinta la pieza y cómo se cuenta la jugada. El de
Aperturas (`js/entreno-aperturas.js`) hace lo mismo con su propia pantalla y
su repaso espaciado. Es anterior y quedó como estaba: unirlos sería mudar
Aperturas a este módulo, un cambio aparte.

**Cuenta en Informes y llena la tarea sola.** Cada línea terminada queda en
`training_progress` con la actividad nueva **`preparacion`**:
- `detail.linea_id` es `<id del plan>:<jugadas>`.
- **Solo si salió limpia** lleva además `detail.theme` = el id del plan.
- La tarea que crea `mandar_plan_rival()` dejó de ser un renglón «completar»,
  que el alumno marcaba a mano. Ahora es **«cantidad»**:
  - tantas líneas como hojas tiene el plan, contadas en SQL igual que
    `lineasDelPlan()`;
  - con `actividades = ['preparacion']` y `filtro_clave` = el id del plan.
  - `tareas_con_avance()`, sin cambios, cuenta los `linea_id` distintos que
    tienen ese `theme`. O sea que **cada línea cuenta una vez, y solo la que
    salió limpia**. Una línea con errores queda registrada, pero sin `theme`, y
    por eso no llega a la tarea.
  - Se lee «Aprender 2 líneas de tu plan contra…», porque el catálogo de Tareas
    (`js/material-plataforma.js`) tiene la entrada `plan-rival` con
    `unidad: "líneas"` y `noSeElige: true`: no se ofrece en `tareas.html`,
    porque cada plan es de un alumno.
  - Las tareas que ya se habían mandado siguen como estaban, con su «Ya lo
    hice».
- **El tiempo** cuenta con `js/tiempo-plataforma.js` en la sección
  **«Preparación de rivales»**. `plan-rival.html` está en `TIEMPO_ACTIVIDAD`
  de `academia-cabecera.py`, y la sección está en `js/tiempo-secciones.js` y en
  el `informe-html.ts` del correo a la casa. Se volvió a desplegar
  `informes-encargados` (versión 16, comprobada por huella contra el
  repositorio): lo desplegado todavía no tenía ni «Finales contra la máquina».
  `tiempo_por_seccion()` no hubo que tocarla, porque pasa la actividad como
  sección.
- Lo que ya salió limpio se lee de la base, no del navegador: vale en la
  computadora y en el celular.
- **Se registra solo si quien mira es el alumno del plan.** Un profesor que lo
  prueba lo juega igual, pero no le suma a nadie, y la página lo dice.

Comprobado en SQL, con un plan de dos líneas:
- la tarea pide 2;
- la línea limpia repetida cuenta una vez y la de errores no cuenta (1 de 2);
- con la segunda limpia queda cumplida;
- la sección «preparacion» de `tiempo_por_seccion()` dice 2 líneas.

El verificador juega en la página con un plan chico:
- una jugada que no es la del plan se deshace;
- el rival contesta y se dice qué jugó;
- con un error se registra sin `theme`, y limpia, con `theme`;
- el progreso sube;
- la pista marca la casilla y no cuenta;
- con negras el tablero se da vuelta y se juega escribiendo;
- un profesor no registra nada.

Comprobado que falla al poner el `theme` siempre y al no deshacer la jugada
equivocada.

### Qué hacer y qué no hacer: el resumen de arriba

Con las siete etapas, el análisis quedó en diez tarjetas llenas de
porcentajes, y quien lo leía no sabía qué hacer con eso: se pidió que fuera
fácil de leer y que no quedara duda de qué hacer y qué no contra el rival.

**Primero la respuesta, después el detalle.** La primera tarjeta es «Qué
hacer contra él» (`js/preparacion-resumen.js` arma, `pintarResumen()` pinta).
Tiene tres bloques:
- **«Cuando tú llevas blancas».** La línea a jugar y, debajo, «Haz esto» y
  «No hagas esto».
- **«Cuando tú llevas negras».** Una línea por cada apertura suya («Si abre
  1.e4 (63 % de las veces)»), con los mismos dos bloques.
- **«En toda la partida».** El reloj, cómo pierde y los finales.

**Cómo se escribe cada consejo.** Es una orden corta: «No vayas a 1.d4 d5.»,
«Prepara cómo castigar 4.Dh4: es un error suyo que repite.». Debajo va el dato
que la justifica, y «Ver» si es una posición.

**Cómo se distinguen «Haz» y «No hagas».** Por el título escrito, no por el
verde o el rojo del borde. El emoji del título va con `aria-hidden`.

**El resumen no detecta nada.** Lee lo que el análisis ya decidió, así que no
puede contradecir el detalle de abajo:
- las líneas fuertes y débiles;
- los errores de Stockfish y sus «cuidado»;
- la salida de la teoría;
- dónde improvisa;
- el cruce con el alumno.

**Una sola detección para el FODA y el resumen.** Lo de más allá de la
apertura se sacó a `senalesMasAlla()` en el análisis:
- devuelve señales con sus datos (`pierde-por-tiempo`, `final-debil`…);
- `fodaMasAlla()` las escribe como FODA;
- el resumen las escribe como órdenes.

Los umbrales están en un solo lugar.

**El porcentaje, dicho en palabras.** «Él saca 23,8 %» no le dice nada a quien
no sabe que son puntos: `comoLeVa()` le agrega el significado:
- menos de 35 %: «le va mal»;
- de 35 a 45 %: «le cuesta»;
- de 45 a 55 %: «parejo»;
- de 55 a 65 %: «le va bien»;
- más de 65 %: «le va muy bien».

Se usa en el resumen y en el plan, también en `plan-rival.html`, que carga el
módulo. «Cómo leer los porcentajes» (un `<details>`) explica la cuenta.

**Lo mejor puede seguir siendo malo.** Contra 1.d4 el plan elige la respuesta
donde él saca menos, pero ahí saca 83 %. La línea lo avisa: «Es lo que mejor
funciona en sus partidas, pero igual le va bien ahí: prepárala a fondo». Sin
eso, se leía como una línea ganadora.

**No se repite.** Una línea débil que ya es el comienzo de la línea
recomendada no vuelve a salir en «Haz esto»: sus números ya están arriba.

**En el plan, las cifras solo cuando cambian.** En una línea sin ramas, diez
renglones seguidos decían «él saca 23,8 % en 21 partidas», y lo que importaba
(qué jugar) se perdía. Ahora:
- el renglón escribe las cifras solo si difieren de las del anterior;
- «(100 % de las veces)» es «(siempre)».

**El aviso de «todavía falta» lo decide la página, no el análisis.** Un
análisis sin `motor` puede no tenerlo nunca (el navegador sin Stockfish, la
revisión parada), y uno sin teoría tampoco (sin el token). Por eso el resumen
no pregunta «¿hay motor?»:
- la página pasa `pendientes(r)`, lo que de verdad está corriendo;
- apenas arranca Stockfish o la teoría, llama a `PreparacionPintar.pendiente()`
  para mostrarlo sin volver a pintar todo;
- con el Stockfish de verdad, la primera repintada llega recién al terminar.

**Probado con un rival de verdad, y corregido.** Con datos de prueba se veía
bien. Con jeigoth5 (500 partidas de Lichess, Elo 2707, con Stockfish, la teoría
y el cruce con un alumno) salieron cinco problemas:
- **Pedía jugadas que elige él.** La línea era 1.g3 y los consejos decían «No
  vayas a 1.e4 g6», pero 1…g6 lo elige él. Ahora el consejo depende de quién
  hace la última jugada (`ultimaEsSuya()`):
  - si es tuya: «Juega 2…Cf6 después de 1.d4 d5 2.Cf3» o «No juegues 2.d4
    después de 1.e4 Cc6»;
  - si es de él: «Si llegan a 1.e4 e6, a él le cuesta: estudia esa posición»
    o «Cuidado si llegan a 1.e4 g6», con «si no la conoces, evita 1.e4».
- **La misma idea salía tres veces.** Pasaba con «1.e4 e6», «…2.d4» y «…3.Cd2
  dxe4 4.Cxe4». Dentro de un mismo tipo de consejo, una línea que empieza o
  continúa otra ya dicha no se repite. Queda la de más peso: cuánto se aparta
  de su promedio por la raíz de las partidas, así que la de 23 partidas gana
  a la de 7. Entre tipos distintos sí se repite: «ahí deja la teoría» y «ahí
  repite un error» en la misma línea son dos consejos.
- **1.g3 salía de 9 partidas de 500 y no lo decía.** Debajo del doble de
  `minimo` se avisa: «Son solo 9 partidas: tómalo como pista, no como regla».
- **Lo del alumno no aparecía.** Ahora va antes que las líneas generales, porque
  es quien va a jugar, y solo si ahí el rival saca menos de 50 %. Además, la
  línea recomendada dice si el alumno ya la juega o si juega otra cosa: «suele
  jugar 1.d4 y no 1.g3 (653 contra 89): que practique la línea antes».
- **«Busca» una línea donde él saca 50 %.** Ahora dice «rinde menos que de
  costumbre»; «le cuesta» o «le va mal» se dicen solo cuando lo es.

El verificador arma un caso con esos datos y comprueba cada regla. Falla si se
quita la deduplicación o si se pide la jugada de él como si fuera tuya.

**El orden de las tarjetas.** Va de lo más útil para jugarle a lo más general:
1. el resumen;
2. las cifras;
3. qué jugarle, jugada por jugada;
4. el cruce;
5. Stockfish;
6. la teoría;
7. el FODA;
8. más allá de la apertura;
9. el repertorio;
10. dónde rinde menos y más;
11. las tablas.

El FODA bajó: ahora es el detalle, no la respuesta.

**Cómo se comprueba.** `verificar-preparacion-rivales.js`, en «Qué hacer y
qué no hacer contra él», mira:
- las órdenes y su porqué con el rival de prueba;
- las del reloj con el de «cómo pierde»;
- que un análisis de la versión 1 se resuma igual;
- en la página, el orden de las tarjetas;
- que «Ver» abra el error en el tablero;
- que el aviso se vea apenas arranca y se vaya al terminar, también sin token;
- que el plan no repita cifras.

El doble del explorador tarda 60 ms en contestar, como la red. Si contestara
al instante, la teoría terminaba antes de que la prueba alcanzara a ver el
aviso.

Comprobado que falla en cuatro casos:
- al repetir la línea débil;
- al dejar el aviso siempre a la vista;
- al escribir las cifras en todos los renglones;
- al no avisar cuando empieza.

### El plan a la medida del alumno

Con jeigoth5, el plan general recomendaba 1.g3, que salía de 9 partidas de
500. GMpupilo, el alumno que lo iba a enfrentar, juega 1.d4 en 653 de sus 986
partidas. Un plan que el alumno no conoce se juega mal, por buenos que sean
sus números.

**Cómo elige.** Con un alumno cruzado, `planAlumno()` (en
`js/preparacion-cruce.js`) arma el plan sobre el árbol del rival y el del
alumno a la vez:
- Donde le toca al alumno, elige la jugada con la que el rival saca menos (lo
  suavizado, igual que el plan general), con un premio para lo que el alumno
  ya juega.
- El premio vale 5 puntos si la jugó `minA` veces o más, y hasta 10 puntos más
  según qué parte de sus partidas en esa posición la juega.
- Entre dos opciones parecidas gana la que conoce. Una claramente mejor contra
  el rival gana aunque sea nueva.
- Donde le toca al rival, sigue sus respuestas igual que el plan general.

**Cómo sale con jeigoth5, a mano.** Estas cuentas son de los números del cruce
guardado:
- Contra 1.d4, 1…c6 (él saca 65 % suavizado, en 5 partidas; GMpupilo nunca la
  jugó) pierde con 1…d5 (66 % en 23 partidas; GMpupilo la juega en la mitad).
- 1.g3 (43 % en 9 partidas) le sigue ganando a 1.d4 (58 % en 34), porque la
  diferencia es grande. Pero GMpupilo jugó 1.g3 89 veces: la conoce.

**Una sola puerta: `planDe(r, lado)`** (`js/preparacion-lineas.js`). Todo lo
que usa «el plan» pregunta ahí:
- «Qué jugarle» y el resumen;
- el PGN, lo que se le manda al alumno y lo que se guarda en Archivos;
- las tareas de Stockfish.

Con un cruce que trae `planAlumno`, devuelve ese; si no, el general. Un cruce
guardado antes (versión 1) sigue usando el general. El «¿ya lo juega?» del
cruce se pregunta sobre el plan que va a jugar, que es el suyo.

**Lo que se ve.**
- En «Qué jugarle»:
  - el plan dice «a la medida de Ana»;
  - en cada jugada de ella, «Ana la jugó 30 veces»;
  - si el general elegía otra cosa, «El plan general, sin mirar a Ana» queda
    plegado debajo.
- En el resumen, la línea lo avisa: «Sin mirar a Ana, lo que más le cuesta a
  él es 1.c4…».

Quien prepara decide con las dos a la vista.

**Stockfish revisa lo nuevo, no todo otra vez.** El cruce llega después del
análisis, y cambia el plan. `revisar()` en `js/preparacion-motor.js` hace esto:
- toma de `r.motor.lineas` lo ya evaluado y pide solo lo que falta
  (`faltan(r)`);
- la página relanza la revisión al cruzar;
- si ya estaba revisando, al terminar ve que las tareas cambiaron y sigue.

**Cómo se comprueba.** `verificar-preparacion-rivales.js` tiene «El plan a la
medida del alumno». Pedro saca 40 % contra 1.e4, 30 % contra 1.c4 y 80 % contra
1.d4; Ana juega siempre 1.e4. Se comprueba:
- el general elige 1.c4;
- el de Ana elige 1.e4, y es el que revisan Stockfish, el PGN y el plan que se
  manda;
- con 1.c4 en 0 de 12, gana 1.c4 aunque Ana no la juegue;
- sin cruce, o con un cruce viejo, el plan es el general.

En la página se comprueba que Stockfish pide 2 posiciones y no todas cuando
falta una sola jugada. Falla sin el premio, con `planDe` devolviendo siempre el
general y sin reutilizar lo revisado.

### Stockfish sobre su repertorio real

Con jeigoth5, la revisión miró 7 jugadas, las del plan, que era corto. Decía
«no se encontró ningún error», pero en realidad no se había buscado:
- su 1.d4 (125 partidas) no se revisó;
- 1.Cf3 (57) tampoco;
- ni lo que sigue después.

**Qué revisa ahora.** El análisis guarda `jugadasSuyas`: las jugadas de él que
repite, con `minimo` partidas o más, en todo su árbol y de la más jugada a la
menos (25 por color). `tareasDelMotor()` revisa dos cosas:
- el plan, igual que antes (30 como mucho);
- hasta 40 de esas jugadas suyas, aunque el plan no pase por ahí.

Un error ahí aparece en la tarjeta y en el resumen con `repertorio: true`:
«Prepara cómo castigar…». Un análisis guardado antes usa sus `repertorioLineas`,
o nada si no las tiene.

**Probado con el Stockfish de verdad.** Con el repertorio guardado de jeigoth5,
Stockfish 19 lite revisó 17 jugadas en 11 segundos, 10 de ellas suyas, y no
encontró errores: sus sistemas con 1.d4 son sólidos. Por eso la tarjeta dice
cuánto se buscó y qué significa: «Se revisaron N jugadas suyas… ninguna es un
error claro. Para ganarle, más que una trampa, sirve llevarlo a donde rinde
menos».

**Cómo se comprueba.** «Stockfish sobre su repertorio real», en el verificador.
El 2…e6 de Pedro contra 1.d4 d5 2.c4 no está en el plan con blancas:
- se revisa igual;
- si Stockfish lo da como error, aparece y el resumen pide prepararle el
  castigo.

Falla si se ignoran las `jugadasSuyas`.

### Las partidas donde perdió

Un porcentaje dice dónde le va mal; ver cómo le ganaron dice qué hacer. Cada
línea y cada consejo del resumen traen «Cómo le ganaron aquí (N partidas)»,
plegado. Adentro van las más recientes: fecha, rival, cómo perdió y «Ver la
partida ↗».

**Qué se guarda.** El análisis guarda `derrotas`: las partidas que perdió, de
la más reciente a la más vieja y hasta 300. De cada una, solo lo justo:
- sus primeras 20 medias jugadas (para saber por qué línea fue);
- la fecha, el rival, su Elo y cómo terminó;
- el enlace.

Así funciona también en un análisis guardado, que ya no tiene el PGN, y en el
plan a la medida. `derrotasEn(r, sec, color)` (en `js/preparacion-resumen.js`)
busca las que empiezan con esa línea exacta; las transposiciones no cuentan,
así que pueden ser menos que las del árbol.

**El enlace sale del PGN y termina en un `href`.** `enlaceDe()` solo acepta
`https://lichess.org/…` o `https://www.chess.com/…`, de `Site` o de `Link`.
Un `javascript:` o un `lichess.org.malo.com` no pasan. Se abre en otra pestaña,
con `rel="noopener noreferrer"`, y lo dice su `aria-label`.

**Cómo se comprueba.** «Las partidas donde perdió» (en Node y en la página)
revisa:
- el orden;
- que el enlace malo no pase;
- el conteo por línea y por color;
- el plegado;
- que ningún `href` de la página escape al filtro.

Falla si se afloja el filtro de enlaces.

### Los temas tácticos del rival

Se pidió estudiar a fondo qué temas tácticos hace más y con cuáles pierde. Lo
hace `js/preparacion-tactica.js`, que corre en el trabajador junto con el
análisis.

**El momento decisivo de cada partida.** Es la primera vez que un bando pierde
2 puntos de material o más y no los recupera:
- el material se mide solo en posiciones tranquilas (la jugada siguiente no
  captura ni corona), así un cambio a medio hacer no cuenta como pérdida;
- después se miran las jugadas del ganador desde 3 antes del cambio hasta
  que cobra;
- la primera con patrón es el tema, en este orden: jaque doble, descubierta,
  horquilla, clavada, enfilada, eliminación del defensor;
- si ninguna tiene patrón: coronación; si no, pieza sin defender (la dejó
  colgada o atacada por una de menos valor); si no, «otra»;
- las partidas que terminan en mate sin haber perdido material son «mate del
  pasillo» (rey en su primera fila, encerrado por sus piezas, jaque por la
  fila) o «ataque de mate».

**El patrón tiene que ser el que cobró.** Cada patrón dice a qué piezas ataca,
y cuenta solo si después se cobra una de ellas. Sin esto, una clavada sin
importancia tres jugadas antes se llevaba el crédito de una torre que el
rival dejó colgada. En partidas de prueba, las «clavadas» bajaron de 16 a 3.

**En sus victorias es lo que él hace; en sus derrotas, lo que le hicieron.**
- La tarjeta «Su táctica: con qué gana y con qué pierde» va después del FODA.
  Cada tema trae cuántas partidas son, «Ver ejemplo» (el tablero se abre en la
  jugada que decide), el enlace a la partida y «Practicar …», que lleva a
  `entreno/temas.html?tema=` (fork, pin, skewer, discoveredAttack…).
- El resumen, en «En toda la partida», suma los temas que pesan (3 partidas o
  más y al menos el 15 % de las que se decidieron por material):
  - con qué pierde va como «Busca horquillas: es con lo que más pierde»;
  - con qué gana, como «Cuidado con sus clavadas».
  - Si lo táctico ya dice que pierde por mate, «Ataca a su rey» no se repite.

**Es un conteo por patrón, sin motor, y lo dice.** Stockfish sobre cientos de
partidas enteras no entra en el navegador. Con 300 partidas el análisis tarda
menos de 200 ms, y se miran las 2.000 más recientes como mucho. Sirve para ver
tendencias, no para juzgar una partida. Las que se decidieron sin perder
material (por tiempo, en lo posicional o por abandono) no entran, y la tarjeta
dice cuántas son.

**Ninguna posición se inventa.** Las pruebas usan posiciones armadas para
cada tema, y cada jugada se comprueba con chess.js: horquilla de caballo,
clavada de la dama contra el rey, enfilada, descubierta con jaque, torre
colgada, mate del pasillo y eliminación del defensor. También usan dos
partidas reales desde el inicio: el mate de Légal y la trampa de la Petrov
(5.Cc6+ a la descubierta).

**Cómo se comprueba.** «Su táctica: con qué gana y con qué pierde» y su
versión en la página revisan:
- cada tema;
- la clavada que no se lleva el crédito;
- el conteo de victorias y derrotas;
- los ejemplos;
- la tarjeta, el resumen, la práctica y «Ver ejemplo» en 5.Cc6+.

Falla si se quita la regla de «el patrón tiene que ser el que cobró».

### Forma reciente, ritmo de la partida y hoja para imprimir

**Su forma reciente (`formaReciente()`).** Un rival que cambió de defensa hace
dos meses deja sin valor el plan armado con años de partidas.

Qué se compara:
- las partidas recientes, que son los 3 meses antes de su ÚLTIMA partida (no
  de hoy, porque el archivo puede ser viejo), o sus 30 últimas si en esos
  meses jugó menos de 20;
- contra las anteriores;
- con blancas, su primera jugada; con negras, su respuesta a las dos primeras
  jugadas que más le hacen.

Cuándo cambió, siempre con 8 partidas o más en esa posición de cada lado:
- si la más jugada ahora no es la de antes, y ahora sale en el 40 % o más;
- si algo que casi no jugaba (menos del 10 %) ahora sale en el 30 % o más.

Qué muestra:
- arriba del color que corresponde, un aviso con borde: «Ojo: últimamente
  contra 1.e4 juega 1…c5, que casi no jugaba… Prepara las dos»;
- si en las recientes saca 10 puntos más o menos que antes, «Viene en racha»
  o «Viene a la baja» en «En toda la partida».

Con menos de 40 partidas con fecha, no se calcula.

**El ritmo de la partida que viene.** «Tu partida es a…», en los filtros,
junta los ritmos: rápida con clásica, bullet con hiperbullet
(`mismoRitmo()`).
- Si a ese ritmo tiene 30 partidas o más (`POCAS`), el análisis se filtra a
  él, y el resumen dice «Preparado para una partida a blitz: se usan solo sus
  partidas a ese ritmo».
- Si tiene menos, se usan todos sus ritmos, y el resumen avisa con cuántas
  partidas cuenta a ese ritmo y cuánto saca: jeigoth5 tiene 11 partidas a
  rápida contra 474 de bullet y blitz.
- En un análisis guardado no se vuelve a analizar: solo cambia el aviso.

El ritmo elegido queda en `filtros.partida`, se guarda con el análisis y sale
en la hoja.

**La hoja para imprimir (`pintarHoja()`).** Es una página con lo esencial,
para llevarla a la partida o mirarla en el celular antes de sentarse
(guardada en PDF). Lleva:
- la línea de cada color;
- tres cosas que hacer y tres que no;
- lo de toda la partida;
- los avisos de forma reciente y de ritmo.

Cómo se arma:
- sale del mismo `armar()` del resumen, así que no puede decir otra cosa;
- no lleva botones, plegables ni enlaces, porque en papel no se tocan;
- se arma en `#hoja`, un hijo directo del `body`, y
  `@media print` con `html.imprimir-hoja` (en `css/styles.css`) oculta todo lo
  demás;
- en pantalla no se ve;
- la clase se quita en `afterprint`.

Con el análisis guardado de jeigoth5, Chromium la imprime en una sola página A4.

**Cómo se comprueba.** «Forma reciente y ritmo de la partida» y «El ritmo de
la partida y la hoja para imprimir», en el verificador. Pedro pasó de 1…e5 a
1…c5 y viene ganando todo. En la página se comprueba:
- que blitz filtra y rápida avisa;
- que en pantalla la hoja no se ve;
- que «Hoja para imprimir» la arma e imprime;
- que, emulando la impresión, sale solo la hoja, medido con `checkVisibility()`.

Falla sin la regla de impresión y sin detectar el cambio de repertorio.

### La táctica, revisada con Stockfish

El reconocedor de patrones («Los temas tácticos del rival») no usa motor:
cuenta tendencias, pero no sabe si la jugada del momento decisivo fue un error
de verdad, ni ve lo que el rival pudo hacer y no hizo. Se pidió más precisión,
así que se hace en dos pasos.

**1. En el trabajador, sin motor (`js/preparacion-tactica.js`).** El análisis
guarda dos cosas.
- `momentos`: los 40 momentos decisivos más recientes, con la posición (FEN)
  antes del error del que perdió y la jugada que hizo. El error es su jugada
  justo antes de la del patrón.
- `candidatas`: posiciones donde ÉL tenía con qué ganar material y jugó otra
  cosa, sin ganarlo en las 4 medias jugadas siguientes. Son 40 como mucho,
  una por partida y de sus 100 más recientes.

Tener con qué ganar material quiere decir que, en su turno y sin estar en
jaque, había una pieza contraria de 3 o más atacada por una suya y sin
defender, o defendida pero que vale 2 o más que la que ataca. Primero se
generaron sus jugadas con chess.js, pero con 300 partidas tardaba 8 segundos.
Con los ataques del propio tablero tarda 0,4, y deja pasar alguna jugada que
no es legal: Stockfish decide.

**2. En la página, con Stockfish (`revisarTactica()`, en
`js/preparacion-motor.js`).** Corre al terminar la revisión normal, a
profundidad 14, con el mismo «Parar».
- **Momentos.** Se evalúa antes y después del error. Si perdió 1,5 peones o
  más de golpe, es un error confirmado, con la jugada buena: «Jugó 4…Cf6; lo
  correcto era De7 (perdió 4,98 peones)».
- **Candidatas.** Cuenta como «no la vio» si la mejor jugada de Stockfish lo
  dejaba 1 peón o más arriba y la que jugó perdió 1,5 o más de eso. El tema es
  el de la mejor jugada de Stockfish (`temaDeJugada()`), no el de la sospecha.
- Con mate de por medio no se escribe «M-8 peones»: dice «ganaba la partida» o
  «con eso perdía la partida».
- Queda en `r.tacticaMotor` y se guarda con el análisis. Una revisión parada a
  medias no se guarda como hecha.

**Lo que se ve.**
- **En la tarjeta de táctica:**
  - cuántos momentos fueron errores claros;
  - «Sus errores decisivos», con la jugada buena, «Ver» (se abre en su error)
    y la partida;
  - «Lo que no vio», por tema, con ejemplos: «Tenía 5.Cxh4 y jugó 5.Cc3
    (ganaba la partida)». Trae «Ver», que se abre antes de su jugada, y
    «Practicar».
- **En el resumen:** con 2 o más del mismo tema, «Juega posiciones con
  táctica: se le escapan …».

**Cómo se comprueba.** «La táctica, revisada con el Stockfish de verdad»
corre el Stockfish 19 lite real en la página con dos partidas legales:
- la trampa de la Petrov con él de negras: 4…Cf6?? confirmado, lo correcto era
  4…De7;
- una dama regalada que no toma: 4…Dh4?? 5.Cc3 en vez de 5.Cxh4, que queda
  como «no la vio», pieza sin defender.

Falla con un umbral imposible y sin el tema de la mejor jugada.

### La línea a fondo

La revisión normal de Stockfish mira las jugadas del plan de una en una a
profundidad 18 y solo avisa si alguna es un error. Se pidió más: la línea que
se va a jugar, a fondo, con alternativas, y una continuación para llegar
preparado. Lo hace `aFondo()` en `js/preparacion-motor.js`, y lo pinta la
tarjeta «La línea a fondo», que va después de «Qué jugarle».

**Qué línea.** La principal de cada color, la misma del resumen
(`R.armar(r).lados[…].lineas[0]`): a la medida del alumno si hay cruce. Si
después cambia (otro filtro, otro alumno), la tarjeta lo dice y ofrece volver
a profundizar.

**Qué hace, a profundidad 20.**
- **En cada jugada tuya:** las 3 mejores de Stockfish (`opciones()`, con
  MultiPV, que se vuelve a 1 al terminar porque el resto de la página lo usa
  así). También la evaluación de la jugada del plan, aunque no esté entre esas
  tres.
- **Cuánto se pierde, en palabras:** menos de 0,3 peones es «casi igual, se
  puede jugar»; menos de 0,8, «un poco peor»; más, «claramente peor:
  piénsalo». Sin esto, con jeigoth5 decía «1.g3 no está entre sus tres
  mejores», y asustaba: queda en +0,15 contra el +0,37 de 1.e4.
- **Al final de la línea:** una continuación preparada de 8 medias jugadas,
  con la mejor de Stockfish para los dos lados (`continuar()`).

**Cuándo corre.** Va en un botón («Profundizar con Stockfish»), no solo, porque
tarda: con jeigoth5, entre 27 y 36 segundos con el Stockfish real. Usa el
mismo «Parar» y el mismo estado que la revisión, y si la revisión está
corriendo, pide esperar.

**Dónde queda.**
- Se guarda en `r.lineaFondo`, con el análisis.
- «Ver toda la línea en el tablero» la abre desde el comienzo, con las 3
  opciones en la nota de cada jugada tuya y la continuación marcada.
- La hoja para imprimir lleva «Y después (Stockfish): …».

**Cómo se comprueba.** «La línea a fondo», en el verificador, usa el
Stockfish de mentira, que ahora entiende MultiPV. Comprueba:
- la línea con blancas;
- cada jugada contra las 3 opciones, con el juicio en palabras;
- la continuación de 8 medias jugadas desde la jugada 6;
- que el MultiPV vuelva a 1;
- el tablero, la hoja y lo guardado.

Falla si no se vuelve a MultiPV 1. Con el Stockfish real se probó a mano sobre
jeigoth5.

## Qué tan certera es la preparación

Una preparación dice «juega esto, en esto pierde, esto le funciona», pero no
decía cuánto fiarse. Ahora se prueba contra el futuro, como se prueba un
pronóstico: `certezaDe` (en `preparacion-analisis.js`) arma la preparación
**solo con las partidas anteriores** y la compara con las que jugó después.

- Las nuevas son el 20 % más reciente (al menos 15); las viejas, las de
  **antes del primer día** de las nuevas. Una partida del mismo día no sirve
  para prepararse y para probar a la vez: si todas tienen la misma fecha (un
  PGN sin fechas de verdad), no hay prueba. Hacen falta 60 partidas con fecha
  y 45 viejas; con menos, la tarjeta no sale.
- **¿Adivina lo que juega?** Se bajan sus partidas nuevas por el árbol viejo
  y, en cada jugada suya con bastantes partidas detrás (el mismo mínimo del
  análisis), se cuenta si hizo la más jugada (y si fue una de las dos más
  jugadas). Con menos de 10 decisiones no se juzga.
- **Las débiles, las fuertes y el plan** se comparan con su promedio en las
  partidas nuevas con ese color, no con un número fijo: si en lo nuevo sacó
  53 %, una línea débil se confirma si sacó 5 puntos menos. Si en todo lo nuevo
  ya sacó 0 % o 100 %, no se le puede pedir que quede más abajo o más arriba:
  basta con llegar al extremo. Con menos de 5 partidas: «Todavía no se puede
  decir».
- **«Ya no las juega»**: si tuvo 5 partidas nuevas con ese color y ninguna
  pasó por esas líneas, cambió de apertura, y cuenta en contra: la
  preparación apunta a algo que ya no hace. Antes esto salía como «0 partidas,
  no se puede decir», que era verdad pero escondía lo importante.
- **La confianza** es alta si adivina al menos 60 % y todo lo juzgado se
  confirmó; baja si adivina menos de 40 % o se confirmó menos de la mitad; si
  no, media. Va escrita («Confianza: alta») y con lo que hay que hacer, no solo
  en color: cada comprobación lleva su borde verde o rojo **y** su veredicto
  en palabras.
- La tarjeta va justo después de «Qué hacer contra él»: es lo que dice cuánto
  pesa todo lo demás.

Verificador: `preparacion-rivales` (`pruebaCerteza` con un rival que sigue
igual y otro que cambió 1…e5 por 1…c5, y `pruebaCertezaEnLaPagina`).

### Juega contra él

Todo lo anterior se lee; esto se juega. **«Jugar contra él»**, debajo de cada
plan en `preparacion-rivales.html` y como sección propia en `plan-rival.html`,
abre una partida de práctica contra el rival (`js/preparacion-sparring.js`):

- **Mientras la posición esté en sus partidas, juega lo que él juega**, sorteado
  con el peso de las veces que hizo cada jugada: una que hace 3 de cada 4 veces
  sale 3 de cada 4. Y lo dice: «La juega 63 % de las veces en esta posición (20
  partidas)». Siempre la más jugada habría sido otra forma de repetir el plan;
  sorteada, sale también lo que juega de vez en cuando, que es lo que sorprende
  en la partida de verdad.
- **Cuando la posición ya no está, sigue Stockfish a su Elo** (el reciente del
  análisis, `UCI_LimitStrength` + `UCI_Elo`, entre 1320 y 3190; sin Elo, 1800),
  y lo dice en esa jugada. A toda su fuerza no sería él: sería practicar contra
  la computadora. Al terminar, el motor vuelve a su fuerza completa: en la
  página del profesor es el mismo que revisa el plan.
- **Tu jugada se mide contra el plan**: «Es la del plan», o la primera que se
  aparta dice qué decía el plan. Al terminar (mate, tablas o «Terminar la
  partida»), «Cómo te fue» dice dónde te saliste del plan (o en qué jugada suya
  que el plan no prepara), y cuántas de sus jugadas salieron de sus partidas.
- **Es práctica: no se guarda nada** ni cuenta para la tarea. Para eso está
  «Entrénalo».

**Su libro** (`libroDe()` en el análisis, `js/preparacion-libro.js` para
leerlo):
- Es **por posición**, como el árbol: por otro orden de jugadas se llega al
  mismo lugar y cuentan las dos. En la partida la posición se saca del FEN de
  chess.js con `PreparacionPosiciones.desdeFen()`; el verificador comprueba en
  todas las jugadas de prueba que da la misma clave que el árbol.
- Solo las posiciones donde le toca a él y que vio **2 veces o más**, con sus
  seis jugadas más hechas, hasta donde llega el árbol (30 medias jugadas desde
  «El árbol más hondo»; antes, 16). Con
  una sola partida no hay repertorio: es una partida.
- Cada posición va por una **huella de 53 bits** y no por su clave (unos 11
  caracteres en vez de 60). Se queda con las **1500 posiciones más jugadas** de
  cada color (eran 1000 hasta «El árbol más hondo»): con el peso de lo reciente
  cada posición pesa unos 52 bytes, así que no pasa de 80 KB por color.
- Viaja en el análisis guardado (`r.libro`) y en el plan del alumno (solo el
  color del rival en ese plan). **Un análisis guardado antes no lo trae**: la
  página lo dice en vez de abrir una partida que sería Stockfish desde la
  primera jugada; un plan mandado antes no muestra la sección.

**El tablero es el de «Entrénalo»** (`js/entrenador-linea.js`), con un modo
nuevo, `jugarLibre()`: se juega cualquier jugada legal, la del rival la decide
quien llama, y al coronar se elige la pieza (`js/coronacion.js`). Mismo clic,
teclado y cuadro de comandos del Modo Adaptado, en vez de un segundo tablero.
Si mientras el motor piensa se empieza otra partida, su jugada se tira.

**Stockfish en la página del alumno** es el de siempre (16, el de
`js/shared-engine.js` sin `data-motor`), y el Worker se crea recién cuando la
partida sale del libro. Los dos motores, el 19 lite y el 16, se probaron de
verdad a fuerza limitada: contestan una jugada legal.

Verificador (`preparacion-rivales`): sin navegador, el libro (sus primeras
jugadas en orden, nada suyo cuando no le toca, la transposición, el sorteo por
peso, la clave desde chess.js y el seguimiento del plan) y que al alumno le
llegue solo el libro de su rival. En la página, con el azar fijo y el motor de
mentira: la jugada más jugada con su porcentaje, el tablero desde las negras,
«Es la del plan», el motor que no se pide dentro del libro, la salida del libro
con el Elo, las opciones UCI en su orden, «Cómo te fue», el foco al cerrar, el
aviso de un análisis viejo, y en la página del alumno la partida, sin motor y
sin guardar nada.

#### Los textos, a pedido de quien la usa

«Mi repertorio» (Aperturas y celadas) usa esta misma partida con el libro
armado de las líneas del alumno. Por eso `empezar()` acepta `textos`
(`deLibro`, `saleDelLibro`, `desvio`, `resumenLibro`, `plan`): lo que se dice
de una jugada de libro cambia, lo que se hace no. Sin `textos`, las frases son
las de siempre, palabra por palabra. Ver «Jugar con mi repertorio» en
`entrenamiento.md`.

### Repasar las líneas del plan

«Entrénalo» decía qué líneas ya salían limpias, pero una línea que salió limpia
hace tres semanas no se sabe hoy. Ahora cada línea dice **cuándo le toca**
(«Próximo repaso: 1 de octubre», «Toca repasarla hoy»), arriba dice cuántas
tocan hoy, **«Repasar las de hoy»** abre la primera, y cada línea dice **dónde
se equivocó la última vez** («La última vez fallaste en 1.e4»).

- **Es la repetición espaciada de Aperturas** (`js/repaso-espaciado.js`, SM-2
  recortado): una bien vuelve al día siguiente, a los 3 días y después cada vez
  más lejos; una fallada vuelve hoy y empieza de cero. Limpia es «bien», solo
  con pistas es «regular» y con errores es «mal».
- **No se guarda en ningún lado: se arma con lo que ya está.** Cada intento ya
  quedaba en `training_progress` (etapa 7). `plan-rival.js` los pide por
  `detail->>plan`, **en orden de fecha**, y `desdeHistoria()` los pasa uno por
  uno por `calificar()`. Guardar la ficha aparte habría sido una segunda
  verdad que se desincroniza (lo que se deriva no se guarda), y así vale en la
  computadora y en el celular. El día de cada intento es el de Costa Rica.
- **El orden importa**: dos intentos al revés dan otra fecha. Por eso el doble de
  Supabase del verificador ahora ordena de verdad con `order()` (antes lo
  ignoraba), y la prueba mete los intentos desordenados a propósito.
- **Lo que toca hoy son solo las que ya jugó alguna vez**: una línea nueva es
  «la siguiente línea», no un repaso. Primero la fallada, y entre las demás la
  más atrasada (`pendientes()`).
- **Dónde falló**: el entrenador (`js/entrenador-linea.js`) devuelve `fallos`,
  el índice de cada jugada de la línea donde hubo un error o una pista, y va en
  `detail.fallos` del intento. Se muestra el del último intento de esa línea.
- La tarea no cambia: sigue contando las líneas limpias (`theme`).
- Un profesor que mira el plan de un alumno no ve su repaso ni suma nada, como
  antes.

Verificador (`preparacion-rivales`): `desdeHistoria()` sin navegador (dos bien
seguidas, una mal, una con pistas y el orden de `pendientes()`); en la página,
con intentos relativos a hoy y desordenados: cuántas tocan, la fecha de cada
una, dónde falló, que «Repasar las de hoy» abra la que toca, y que al salir
limpia pase a mañana y el botón se vaya. Y en «Entrénalo», que el intento con
un error guarde `fallos: [0]`. Comprobado que falla sin el orden por fecha y
sin guardar dónde falló.

### Varias cuentas del rival y más peso a lo que juega ahora

Dos cosas que se pidieron para tener más partidas y que digan lo de hoy:

**Varias cuentas.** Muchos rivales juegan en Lichess y en Chess.com, o tienen
dos cuentas en el mismo sitio. Debajo del usuario va **«Otras cuentas suyas»**:
el sitio y uno o varios usuarios, separados por coma.
- Se bajan **una tras otra**, después de la de arriba, cada una con el mismo
  «Cuántas». Una tras otra y no juntas por lo mismo que los meses de Chess.com:
  en paralelo contestan 429.
- **Se juntan con el nombre de la de arriba** (`unirCuentas()` en
  `js/preparacion-descarga.js`): en las etiquetas `White`/`Black`, el usuario
  de la otra cuenta pasa a llamarse como la principal, sin distinguir
  mayúsculas. Así el análisis, el trabajador, los filtros y el cruce no se
  enteran de que eran dos: es un jugador, sin pasar una lista de alias por
  todos lados.
- Una cuenta repetida (también con otras mayúsculas) se pide una vez. Un usuario
  inválido se dice antes de pedir nada.
- **Si falla una de las otras, se dice y se sigue** con las demás («De «x» en
  Chess.com: No existe el usuario…»); si falla la de arriba, se para, como
  antes. «Parar» corta todas y analiza lo que ya llegó.
- El botón «Bajar y analizar» va **debajo de las dos filas**: antes de él, con
  el tabulador, se pasa por las otras cuentas.

**Más peso a lo reciente** (`ponerPesos()` en el análisis). Un repertorio
cambia: lo que jugaba hace tres años pesaba igual que lo del mes pasado.
- Cada partida pesa **la mitad por cada año** antes de su partida más nueva
  (vida media de 365 días); sin fecha, como una de hace un año. Cada cuenta
  lleva además `w`, la suma de esos pesos, junto a `n`.
- **Solo para QUÉ juega**: el orden de sus jugadas (`hijosOrdenados`), su
  reparto («la juega 63 %»), el plan, dónde improvisa, su línea principal, las
  líneas de su repertorio y su libro (que guarda `[jugada, partidas, peso]`).
  **Cuánto saca, y los mínimos, siguen con partidas enteras**: 3 de 3 tiene que
  seguir siendo 3 partidas, y un porcentaje de puntos con pesos no se podría
  leer.
- Viene **marcado** («Más peso a lo que juega ahora», en los filtros) y se
  puede desmarcar: vuelve a analizar al instante. `r.filtros.reciente` dice con
  cuál se hizo. Con todas las partidas de la misma fecha no cambia nada.
- «Juega contra él» dice «Últimamente la juega 63 %…» cuando el libro pesa lo
  reciente, y el plan del alumno lleva `reciente` para decir lo mismo.

Verificador (`preparacion-rivales`): sin navegador, un rival que en 2023
contestaba 1.e4 con 1…e5 (30) y en 2026 con 1…c5 (12): sin peso, e5 primero
(71 %); con peso, c5 (80 %), con las partidas enteras y el mismo resultado; su
libro sortea igual y el plan con blancas va contra c5. Y que con una sola fecha
no cambie nada. En la página, con Lichess y Chess.com de mentira: una cuenta de
más inválida, el orden de lo que se pide (sin repetir), el rival único con 78
partidas y la cuenta que no existe dicha; y el filtro marcado que, desmarcado,
vuelve a analizar. Comprobado que falla sin pesos y sin juntar los nombres.

### El árbol más hondo

El árbol del rival llegaba a 16 medias jugadas (la jugada 8): el plan no veía
sus líneas largas y «Juega contra él» salía siempre de su libro ahí, aunque él
repitiera la misma Española hasta la jugada 15. Ahora llega a **30 medias
jugadas** (`MAX_JUGADAS_ARBOL`), el plan principal a **16** (antes 10) y el
libro guarda **1500 posiciones** por color (antes 1000).

**Abrir todo hasta la 30 no se podía.** Allá abajo casi cada partida es
distinta: con 6000 partidas de 40 medias jugadas de prueba, el análisis pasó de
1,95 s y 107 MB a 3,74 s y 356 MB, casi todo en nodos que vio una sola partida y
que nada usa (lo que menos pide algo es el libro, 2 partidas). Así que
`armarArbol()` abre todo **hasta la media jugada 16** (`PROFUNDIDAD_COMPLETA`),
como antes, y más allá **una secuencia que vio una sola partida no se abre**:
el nodo guarda la partida (`solo`) y la sigue bajando recién cuando llega una
segunda por el mismo camino. Con las mismas 6000 partidas: 1,94 s y 122 MB.

- **Lo que se pierde**: dos partidas que llegan a la misma posición profunda
  por caminos distintos, una por cada camino, no se juntan (cada una quedó
  guardada en su nodo). Con dos o más por un camino, sí: la transposición se
  junta como siempre (el verificador lo comprueba: la Española con …Ab7 y
  …Cbd7 cambiados de orden llega a la misma posición en la jugada 11).
- Hasta la media jugada 16 no cambia nada, ni para lo que vio una sola.
- Todo lo que baja por el árbol (el plan, el libro, lo que juega, la certeza)
  sigue igual: un nodo sin abrir no tiene hijos, como el final de una partida.
- `lineasDeSuRepertorio()` sigue hasta la media jugada 20 y el cruce con el
  alumno hasta la 14: más hondo, el explorador de maestros recibiría más
  pedidos y el cruce casi nunca encuentra posiciones en común.

Verificador (`preparacion-rivales`, «El árbol más hondo»): una Española
cerrada de 24 medias jugadas, 6 veces, y una que se aparta en la jugada 10. Su
libro llega a la jugada 11, sabe que una vez se apartó, el plan pasa de la
jugada 5; la que se apartó no se abre, con una segunda se abre y se junta por
transposición; y una Berlinesa que vio una sola entra entera hasta la media
jugada 16 y no después.

### Su tipo de posición

La táctica decía con qué golpes gana y pierde; faltaba **en qué posiciones**
le va mal, para buscarle una partida y no solo una apertura. La tarjeta **«Su
tipo de posición»** (después de la táctica) y el resumen de arriba («Busca
quedarte con el peón aislado», «Evita cerrar el centro») salen de
`js/preparacion-estructuras.js`:

- **Se mira cada partida en la jugada 12** (24 medias jugadas): la apertura ya
  terminó y los peones quedaron armados. Una partida más corta no cuenta. La
  posición sale de `js/preparacion-posiciones.js`, sin chess.js.
- **Los rasgos**, desde el lado del rival:
  - peón aislado de dama (en d, sin peones en c ni en e): el suyo y el de su
    rival, por separado (no es lo mismo tenerlo que jugar contra él);
  - peones colgantes (c y d, sin peones en b ni en e): los suyos y los de su
    rival;
  - **centro cerrado**: un peón central que cruzó y quedó trabado (e5 contra
    e6, d5 contra d6, o …e4 contra e3). **d4 contra d5 no cierra nada**: con
    la primera versión, que contaba cualquier peón con otro delante, toda
    Tarrasch salía «cerrada»;
  - centro abierto (ningún peón en d ni en e), enroques opuestos (los reyes en
    alas distintas) y sin damas.
- **Se juzga contra lo esperable para ESAS partidas**: el promedio del rival con
  el color que llevaba en cada una, no el 50 % ni su promedio general. Con
  negras saca menos, y eso no vuelve débil a toda estructura típica de las
  negras (la misma decisión de «Dónde rinde menos»).
- Cuenta cuando se aparta más de lo que explica el azar (z de ±1,28) y en 5
  puntos o más, **con 8 partidas o más** (o el mínimo del análisis, si es
  mayor). Con menos, la tarjeta dice «Pocas partidas para decir algo»: 6
  Tarrasch perdidas contra 6 Españolas ganadas no alcanzan.
- **El veredicto va escrito** («Ahí rinde menos: búscalo») y el borde lo
  acompaña: verde es bueno para quien le juega, rojo malo.
- Al resumen van dos de cada lado como mucho, con el dato («En la jugada 12
  le pasa en el 33 % de sus partidas; ahí él saca 25,0 %…»).
- Un análisis guardado antes no trae `r.estructuras`: la tarjeta no sale.

Verificador (`preparacion-rivales`, «Su tipo de posición»): tres aperturas que
llegan enteras a la jugada 12, **comprobadas con chess.js** (la Francesa de la
primera versión tenía una jugada ilegal: el caballo iba a h2, donde había un
peón). Sin navegador: los rasgos de cada una (y de una Escocesa con enroques
opuestos y sin damas), el veredicto con Pedro sacando 25 % contra el peón
aislado y 85 % con el centro cerrado, lo esperable con blancas, el resumen, el
mínimo de 8 y que una partida corta no cuente. En la página: la tarjeta
después de la táctica, cada veredicto escrito, el dato y el resumen. Roto a
propósito sin lo esperable por color, con «cerrado» para d4 contra d5 y sin el
mínimo: saltó cada vez.

## Los proyectos

`admin.html#proyectos` y `proyecto.html`: un programa de clases armado de
antemano para varios grupos, como Campeones Colegiales 2026 (Finales, Medio
Juego y Aperturas, 18 clases cada uno, de mediados de octubre al 13 de
diciembre). Se pidió una ficha «Proyectos» en administración, con una ficha
por grupo, el plan completo con sus ejercicios listos para la clase en vivo,
la posibilidad de asignárselo al profesor para que dé cada sesión, tareas
semanales para mandar a los alumnos y clases entretenidas.

**Cuatro tablas, y desde afuera solo se leen.** `proyectos`,
`proyecto_grupos` (con su `guia` en jsonb: objetivos, evaluación, rúbrica,
portafolio, anexos), `proyecto_sesiones` (fecha, tipo, el detalle de cada
bloque y el `plan_id` de su plan de clase) y `proyecto_tareas` (los renglones
con la misma forma que recibe `crear_tarea()`). La RLS deja leer a quien
administra todo y al profesor asignado su grupo, su proyecto, sus sesiones y
sus tareas; las políticas de proyecto, sesiones y tareas cuelgan de la del
grupo. No hay ninguna política de escritura: el contenido lo siembra un script
y la asignación la hace una función.

**Asignar comparte, no copia.** `asignar_grupo_proyecto(grupo, profesor)` exige
administrar (con `coalesce`), exige que la cuenta sea de un profesor, le
COMPARTE los planes de las sesiones (`plan_compartidos`) y se los deja de
compartir al anterior. Devuelve a quién quedó asignado, leído de la tabla, y
la ficha pinta eso. Los planes son de quien administra, como los de arranque:
un plan es de quien lo escribió y la RLS no deja firmar por otro. Por eso
`planes.html?plan=` ahora abre también un plan compartido, y no solo uno
propio. Asignar reparte acceso a material: `proyecto_grupos` lleva el trigger
de auditoría (solo sobre `profesor_id`, `asignado_por` y `nombre`; volver a
sembrar la guía no llena la bitácora) y va en `VIGILADAS`.

**El contenido vive en un JSON y lo convierte un script.**
`herramientas/proyectos/<slug>.json` dice qué se hace en cada clase y de
DÓNDE sale cada posición, pero no trae ni una FEN: un final de «El mapa de los
finales», un tema de Ejercicios por tema, un mate del banco, una línea de
Aperturas. `herramientas/proyecto-semilla.js` las busca en esos bancos con las
mismas funciones que los planes de arranque (`herramientas/lib/planes-banco.js`,
que salió de `planes-semilla.js` sin cambiar su salida) y las pasa por la
regla de la clase en vivo: 125 posiciones, ninguna descartada. Escribe un SQL
que se puede correr las veces que haga falta: vuelve a sembrar todo y respeta
a quién se asignó cada grupo.

**Las lecciones se buscan por su título, no por su número.** El número que
abre la clase en vivo es la posición del `<details>` en el HTML del curso, y en
un curso con «Solución» entre lección y lección no coincide con el que dice el
título. Al revisarlo apareció un error que ya estaba: el renglón de lección de
un plan guarda `leccion` contada desde 0 y `abrirLeccionLocal(slug, n)` usa
`detalles[n-1]`, así que en la clase en vivo se abría la lección ANTERIOR. Se
arregló en `js/sesion.js` (`item.leccion + 1`), y vale para todos los planes,
no solo los de los proyectos.

**Las tareas, con el catálogo de tareas.html cargado tal cual.** Cada renglón
sale de `js/material-plataforma.js`: con qué actividad cuenta, qué meta admite
y a dónde lleva. Un renglón con la actividad equivocada se queda en cero para
siempre sin dar ningún error. Los cuestionarios listos no tienen un id fijo
(viven en la base), así que el renglón lleva la marca `@@cuestionario:Título@@`
y el SQL la reemplaza con el id del listo. **La marca va sin codificar también
en el enlace:** la primera siembra la codificó (`%40%40…`), el `replace()` no
la encontró y nueve tareas habrían abierto un cuestionario que no existe. Se
arregló en la base y en el script, y `verificar-proyectos.js` lo revisa. Las
semanas van de lunes a lunes; cada una trae su juego (Batalla naval, el Sonar,
los confites, Ilumina el tablero, Memoria) además de los ejercicios.

**Que la clase sea divertida, con lo que ya tiene la plataforma.** Cada clase
lleva su momento divertido, en la guía y como nota del plan: la clase vota
contra el motor, el Kahoot de un cuestionario listo, la ronda rápida, el
calentamiento en modo competencia, duelos de equipos, Niebla de Guerra o
Crazyhouse entre compañeros. `verificar-proyectos.js` falla si una clase no lo
tiene.

**Cada clase dura 2 horas, en cinco partes y con su paso a paso.** Se pidió
que el profesor solo tenga que leer y aplicar. El plan de cada sesión va, de
arriba abajo, en el orden en que se da: 🔥 Calentamiento, 📘 Contenido, 🎉
Actividad recreativa, ✅ Cierre y 📨 Tarea. Una clase normal reparte 15, 55,
30, 12 y 8 minutos; una de evaluación o especial, 10, 70, 25, 10 y 5. Cada
parte es una nota «N. Parte · M min» con sus pasos numerados, y sus ejercicios
van justo debajo. Cada ejercicio trae en su propio renglón qué preguntar, el
tiempo, la respuesta y el porqué: ① al tablero, ② la pregunta, ③ el tiempo y
cómo contestan, ④ la respuesta, ⑤ por qué. La base deja 500 caracteres ahí, y
lo que se recorta es el porqué, nunca la respuesta. El porqué sale del banco
(el comentario o la clave del diagrama, la clave de la línea) o, en los
ejercicios de Lichess, de lo que significa su tema. Los dos ejercicios del
calentamiento salen del banco de temas según el nivel del grupo (finales y
cálculo en el avanzado, ataque y defensa en el intermedio, mates y táctica
básica en el inicial), sin repetir ninguno del proyecto ni del contenido. El
Contenido trae lo que dice cada lección (su texto, para leerlo o contarlo), las
ideas que tienen que quedar, los ejercicios guiados, la práctica y la
microenseñanza. La actividad recreativa se explica paso a paso según lo que
sea: la clase vota contra el motor o el profe, Kahoot, ronda rápida, el
calentamiento en competencia, una variante de Juegos, Batalla naval o el Sonar
votando, a ciegas, simultánea, Habilidades por equipos, torneo, partidas
temáticas, los juegos para el taller y los duelos por equipos. Si una no se
reconoce, el generador falla. La Tarea presenta la de esa semana con la frase
de cada renglón, dónde la ven y cuándo vence. Una nota no pasa de 2000
caracteres (lo exige la base): si no cabe, sigue en otra. La sesión ya no
guarda los bloques de 90 minutos; guarda los minutos de cada parte, y la
página del grupo muestra el plan mismo: una sola copia del paso a paso.
`proyecto-semilla.js` escribe también un `-actualizar.sql`, que cambia la
guía, el detalle de cada sesión y los renglones de su plan sin cambiarles el
id, así que sigue valiendo lo compartido con el profesor.

**La página del grupo.** `proyecto.html` sin `?grupo=` lista los grupos que la
persona ve; un profesor con un solo grupo va directo a él. Con `?grupo=`:
la próxima clase arriba, cada clase con su objetivo, lo que dura cada parte,
«Ver el plan» y «Dar esta clase» (`sesion.html?plan=`) y su plan entero en
las cinco partes, las tareas
de cada semana dichas con la frase de Tareas (`MaterialPlataforma.frase`), la
evaluación, la rúbrica, el portafolio y la guía. «Mandar a mis alumnos» abre un
formulario debajo de esa tarea, con los alumnos pedidos de mil en mil, el
selector de subgrupos de Tareas y las fechas propuestas (disponible el lunes a
las 7:00 si todavía no llegó, vence el lunes siguiente a las 8:00 p. m.), en
hora de Costa Rica. **Quien administra ve el plan pero no «Dar esta clase» ni
«Mandar»**: no da clase (ver «El panel de quien administra no es el de un
profesor»); lo revisa con «Ver como: profesor». Todo lo que viene de la base se
pinta con `textContent`.

**En el panel del profesor**, la tarjeta «Proyectos» va en «Tus clases» y sale
solo si tiene un grupo asignado; mirando el panel de otra persona se pregunta
por esa persona.

**Cómo se sembró.** El contenedor no llega a la base, así que el SQL entró por
`execute_sql` en 13 trozos de unos 20 KB, sentencias completas cada uno.
Después se compararon huellas md5 de lo que quedó en la base (la guía en el
texto canónico de jsonb, las sesiones, cada plan con sus renglones y las
tareas) contra lo que escribió el script: coincidieron las cuatro. La RLS se
probó impersonando: el profesor sin grupo y el alumno no ven nada; quien
administra ve 3 grupos, 54 sesiones y 27 tareas; un profesor no puede asignar,
a un alumno no se le asigna, y el profesor asignado pasa a ver 1 grupo, 18
sesiones, 9 tareas y sus 18 planes, que pierde al quitárselo.

**Verificadores.** `verificar-proyectos.js` (sin navegador): calendario en los
días del horario y en orden, momento divertido en cada clase, cada lección del
plan es la de su título, el +1 de `sesion.js`, las tareas (semanas seguidas de
lunes a lunes, actividades y enlaces del catálogo, la marca del cuestionario),
la página conectada y la migración. `verificar-proyecto-pagina.js` (con
navegador): lo que ve el profesor, el envío con `crear_tarea()`, lo que no ve
quien administra y que el alumno no vea nada. La ficha de administración la
revisa `verificar-admin.js`. Rotos a propósito (sin el +1, con la marca
codificada, dándole clase a quien administra): saltaron.

## Las inscripciones a torneos en línea

`inscripciones.html` muestra lo que llegó por `inscripcion.html`, el formulario
público de torneos. Es de **quien administra o coordina**, no de todo el equipo
docente.

**Esos datos viven en OTRO Supabase.** `inscripcion.html` escribe en el proyecto
"Base de Colegios" (`prcfbzvshnusisczlpxl`), no en el de la Academia, y esa es
toda la razón de que esta página esté armada distinto al resto del sitio.

- **La tabla no se abre, y no se va a abrir.** `public.inscripciones` tiene RLS
  y **ni una sola política**: desde el navegador no la lee nadie. Son cédulas,
  fechas de nacimiento y teléfonos de personas menores de edad, y la clave
  pública de ese proyecto está escrita dentro de `inscripcion.html`, a la vista
  de cualquiera — darle lectura a `anon` sería publicarlas.
- **Y además se le quitó el permiso de tabla, que es otra cosa.** La RLS sin
  políticas ya lo paraba, pero Supabase le concede a `anon` y a `authenticated`
  el `select/insert/update/delete` de toda tabla nueva de `public` y confía en
  la política: o sea que las 87 cédulas dependían de que nadie apagara la RLS
  desde el panel, con un clic y sin ninguna confirmación. Ahora esas dos tablas
  —`inscripciones` y `chess_leads`— no tienen en su ACL más que `postgres` y
  `service_role`, que es con lo que entran la Edge Function y el Worker. Es la
  misma decisión que ya se había tomado en la Academia con `formularios`,
  `formulario_respuestas` y `profile_teachers`: **una puerta menos que dependa
  de que la política esté bien escrita.**
- **`Coles` sí se lee sin sesión, y por eso es la excepción.** Son los 12.104
  centros educativos del MEP —datos públicos— y de ahí sale el selector de
  colegios de `inscripcion.html`, que se abre sin cuenta. Lo que se le quitó es
  lo que nunca usó: `anon` podía **insertar, actualizar y borrar** en la lista
  de colegios del país, y lo único que lo impedía era que su única política
  fuera de `select`. Le quedó `select` y nada más.
- Comprobado impersonando roles en SQL, los cuatro casos: `anon` ya no lee
  `inscripciones` ni `chess_leads` —da error de permisos, que es lo que se
  busca, no «0 filas»—, no puede escribir en `Coles`, sigue leyendo sus 12.104
  colegios, y `service_role` conserva todo.
- Las trae la Edge Function **`inscripciones-torneo`**, que vive en ese mismo
  proyecto y lee con la service role. Las pide de mil en mil, por lo de siempre.
- **El permiso lo decide la Academia, no la función**, y no podría decidirlo
  aunque quisiera: el JWT de quien llama lo firmó el otro proyecto, así que este
  no lo puede validar (por eso su `verify_jwt` va en `false`). Lo que hace es
  **reenviar esa misma sesión** a la Academia y llamar a
  `public.soy_coordinador()`, que es `SECURITY DEFINER` y solo `authenticated`
  puede ejecutar. O sea: la misma regla que decide `cobros.html`, escrita una
  sola vez.
- Comprobado, impersonando roles en SQL y llamando a la función de verdad: el
  administrador recibe `true`; un alumno con sesión válida, `false`; una sesión
  con un `sub` que no existe, `false`; `anon` ni siquiera puede ejecutarla. Y la
  función contesta **401 sin token, 403 con un token inventado y 403 con la
  clave pública de la Academia**. Lo único que no se pudo probar desde acá es el
  camino bueno de punta a punta —hace falta una sesión de verdad de quien
  administra—, así que eso se mira al entrar la primera vez.
- La página vuelve a preguntar `soy_coordinador()` antes de pintar, pero eso es
  solo para mostrar el aviso de siempre en vez de un error feo: quien de verdad
  deja pasar es la función.
- El CSV sale con **punto y coma y BOM**, como el de formularios, y baja **lo
  que se está viendo** (con su filtro puesto): si se filtró por provincia es
  porque se quiere esa lista.
- **Si algún día hay que cambiar quién puede ver esto**, se cambia
  `soy_coordinador()` en la Academia y se cambia solo; la función no tiene
  ninguna regla propia que actualizar.

## Las cifras de la portada

Las cuatro cifras de `index.html` (estudiantes, escuelas y colegios, provincias
y cantones) salen de datos reales. Antes eran números escritos a mano («+500
estudiantes», «+120 artículos» cuando había 7) y no los respaldaba nada.

- **Estudiantes es una suma**: las cuentas de alumno de la Academia más las
  personas inscritas en los torneos en línea. Centros, provincias y cantones
  salen solo de los torneos, que es donde se pide el colegio. Las dos fuentes
  no se cruzan (la Academia no guarda cédula), así que alguien que está en las
  dos se cuenta dos veces. Así lo pidió el dueño del sitio.
- **Cada base tiene su función y ninguna tabla se abre.**
  `cifras_torneos()` (base de Colegios) y `cifras_academia()` (Academia) son
  `SECURITY DEFINER` y **devuelven totales y nada más**: ni una fila, ni un
  nombre, ni cuántos hay por colegio. Por eso, y solo por eso, tienen execute
  para `anon`, igual que `formulario_publico()`: la portada se abre sin cuenta.
  Comprobado impersonando `anon` en SQL: las funciones contestan y
  `select … from inscripciones` sigue dando error de permisos.
- **Quién cuenta.** En los torneos, las personas por cédula (solo los
  dígitos), no por fila: quien se inscribe dos veces es un estudiante. En la
  Academia, `role = 'alumno'` menos las cuentas de prueba, que son las que se
  llaman «Prueba…» (Prueba, Prueba 2, Prueba Gratis): las arma el equipo para
  probar. **Una cuenta de prueba nueva tiene que llamarse así** o entra a la
  cifra.
- **Se actualizan solas**: `js/cifras-portada.js` las pide en cada visita, así
  que un inscrito o una cuenta nueva aparece en la siguiente carga. No hay
  Realtime a propósito: suscribirse exigiría que `anon` pudiera leer las tablas.
  Las llamadas van con `fetch` a PostgREST y no con el cliente de Supabase:
  cargar la librería en la portada solo para esto pesaría más que la portada.
- **El HTML trae escritas las del día en que se armó la sección.** Si una
  consulta falla, quedan esas. Estudiantes solo se reemplaza **si contestaron
  las dos bases**: con una sola, la suma saldría por debajo de la real. Un cero
  o una respuesta rara no pisa la cifra escrita.
- `verificar-cifras-portada.js` lo comprueba con las dos bases dobladas: que se
  pidan las funciones y nunca las tablas, que estudiantes sea la suma, que con
  una base caída no cambie y que con todo caído queden las del HTML.

## Quiénes se están cayendo del plan

- «Tu semana» decía CUÁNTOS alumnos llevan 4 días sin entrenar, pero no
  QUIÉNES ni cuáles tenían un plan que seguir: el profe se enteraba revisando
  uno por uno. En los datos, la mayoría de los que abandonan lo hacen en los
  primeros días después del diagnóstico.
- `public.se_caen_del_plan(p_dias)` (migración
  `20260929153838_se_caen_del_plan.sql`, SECURITY INVOKER como
  `informes_inactivos()`): alumnos con plan —el del diagnóstico o el
  compartido, de los últimos 60 días— que llevan `p_dias` días o más sin
  entrenar desde entonces. El diagnóstico no cuenta como entrenar. La RLS
  decide de quién pregunta cada uno; probado impersonando a una profesora (ve
  a los suyos) y a un alumno (no ve a nadie más).
- `js/clases.js` → `cargarSeCaen()` pinta `#profe-caen` debajo de los
  números: seis nombres (los que acaban de caerse primero: todavía se
  recuperan con un mensaje), cada uno con su informe a un clic
  (`informes.html?alumno=<id>`), y «Y N más en Informes». Sin nadie, no se
  pinta. Mirando como otra persona («Ver como») tampoco: la RLS respondería
  con la gente de quien mira.
- Lo prueba `verificar-panel.js` (nombre por textContent incluido).

## Hoy entrenaron

- El alumno tiene su resumen del día en el hub; el profe no veía nada del
  día: «Tu semana» cuenta a siete días. Debajo de «Se están cayendo del plan»
  va `#profe-hoy`, que dice quién entrenó hoy, cuánto y cuántos salieron
  limpios. Por ejemplo, «Ana Rojas — 12 ejercicios · 9 de 11 limpios». Cada
  nombre lleva a su informe.
- `public.entreno_hoy_de_mis_alumnos()` (migración `20260929175618`,
  SECURITY INVOKER): una fila por alumno que entrenó hoy (día de Costa
  Rica), de más a menos.
  - «Limpios» cuenta solo lo que dice cómo salió; sin nada de eso, no se
    menciona.
  - La RLS decide de quién. Se probó impersonando a un profesor que no
    administra, con filas de prueba revertidas: ve a su alumno y no al
    ajeno. Administración ve a todos, a propósito.
- `js/clases.js` → `cargarHoyEntrenaron()`: seis nombres y «Y N alumnos
  más». Sin nadie, no se pinta, y mirando como otra persona («Ver como»)
  tampoco, por lo mismo que la lista de los que se caen.
- Lo prueba `verificar-panel.js` (nombre por textContent incluido, sin
  «limpios» cuando no hay con qué, oculto sin nadie).

## Agregar a mi calendario

El alumno veía «Tu próxima clase» en el panel, pero solo una y solo si
entraba a mirar. Ahora, en «Tus clases», la tarjeta «📅 Tu calendario» baja
un `.ics` con sus clases de las próximas cuatro semanas, sus tareas
pendientes y sus exámenes por rendir. El calendario del celular, Google
Calendar y Outlook lo abren y lo agregan.

- **Las clases las da `public.mis_clases_proximas(p_dias)`** (migración
  `20261004044349`, SECURITY DEFINER). Es `mi_proxima_clase()` con más de
  una fila, con la misma regla de qué clase es suya (su subgrupo, o un grupo
  igual al suyo, de uno de SUS profesores). El horario del profe sigue sin
  abrírsele. `p_dias` va de 1 a 90 y la respuesta no pasa de 200 filas.
  - Probado impersonando roles, con filas de prueba revertidas: el alumno ve
    sus dos horarios (uno escrito con su grupo en mayúsculas), 2 clases en 7
    días, 8 en 28 y 26 en 1000 (el tope de 90). Otro alumno no ve ninguna y
    sigue sin leer `horario_clases`, y `anon` no la puede llamar.
- **Las tareas y los exámenes** salen de las mismas funciones que la franja
  de arriba (`tareas_con_avance`, `examenes_con_nota`). Lo vencido, lo
  entregado y lo congelado no entran.
- **El archivo lo arma `js/calendario-ics.js`**, que es puro y se prueba sin
  navegador:
  - Las horas van con `TZID=America/Costa_Rica` y su `VTIMEZONE` (UTC−6 fijo):
    la clase de las 4 p. m. es la de Costa Rica en cualquier aparato.
  - **Cada evento lleva un UID que no cambia**: la clase de ESE horario en ESE
    día, y la tarea o el examen por su id. Es una foto, no una suscripción.
    Si el profe cambia el horario, el alumno vuelve a bajarlo, y los
    calendarios que respetan el UID actualizan en vez de duplicar. Una
    suscripción (`webcal://`) necesitaría una dirección con una clave por
    alumno que no caduque, y eso es otra puerta a sus datos. Se dejó afuera.
  - Avisa 30 minutos antes de cada clase y un día antes de cada entrega.
  - El título que escribió el profe se escapa (`;`, `,`, `\`, saltos de
    línea): un «;» suelto cortaba el campo. Las líneas se doblan a 75 bytes
    sin partir una tilde.
- **Solo al alumno con profesor**, y no mirando como otra persona: sin profe
  no hay clase que agendar, y con «Ver como» las funciones contestarían con
  la cuenta de quien mira. Sin nada con fecha, lo dice y no baja un archivo
  vacío.
- **Va en «Tus clases» y no al lado de la línea de la clase en vivo**: esa
  línea tiene que ocupar poco en el celular (`pruebaSesionEnVivo`, menos de
  110 px), y el botón la pasaba. «Tus clases» se pinta si hay calendario,
  última clase o puntos del mes.
- Lo prueban `verificar-calendario-ics.js` (el archivo: zona, escapado,
  líneas dobladas, UID, lo que no entra) y `pruebaCalendario` en
  `verificar-panel.js`: baja el archivo con las 4 fechas, pide 28 días y lo
  suyo con su id, sin profe no está y quien da clase no lo ve. Si el escapado
  de la coma se rompe a propósito, salta.

## El panel para los más pequeños

El panel del alumno está pensado para quien lee: grupos, descripciones, «Hoy
te toca», números. Un niño de 5 a 8 años se pierde ahí. **«🧸 Panel para los
más pequeños»** (Configuración, solo al alumnado) cambia el panel por uno de
pocas puertas grandes.

- **Es de este aparato** (`panel_pequenos_v1`), como el Modo Adaptado: suele
  ser la tableta de la casa, y el mismo alumno en la compu del colegio ve el
  de siempre. No es de la cuenta a propósito: no depende de quién es el niño
  sino de dónde está y quién lo acompaña.
- **Cinco grupos con nombres de niño** (`PANEL_PEQUENOS` en `js/clases.js`):
  «Mi clase», «Lo que me pidió mi profe» (Mis tareas), «A entrenar» (Mates,
  4×4, Las casillas, Aprender), «A jugar» (Juega con Oscar, Juegos) y «Mis
  premios» (Mis medallas). Son las mismas tarjetas de `TILE_GROUPS` buscadas
  por destino, así que el mantenimiento y las marcas valen igual. Lo que
  cambia es el nombre (`NOMBRE_PEQUENOS`), el dibujo grande (`grande` en
  `renderTileCard`) y que no lleva descripción.
- **Lo que es para leer se esconde** con una regla de `css/styles.css` sobre
  `html.panel-pequenos`: el buscador, «Hoy te toca» y los números, «Tus
  clases», lo que más usa, las favoritas y la campana. La franja de lo que
  vence (las tareas) se queda: es lo único con fecha.
- **«🔊 Escúchame»** dice en voz alta lo que hay para tocar («Hola Ana. Toca un
  dibujo para entrar: …»), con la voz del navegador (`BlindNotation.speak` si
  está, si no `speechSynthesis` en es-CR). **«Volver al panel de siempre»**
  borra la marca y recarga: no hace falta que un adulto busque Configuración.
- No vale para quien da clase, para «Ver como» ni para el panel adaptado (la
  cuenta marcada como ciega manda).
- Lo prueba `pruebaPanelPequenos` en `verificar-panel.js`: los grupos, los
  nombres, que lo de leer no se VE (`checkVisibility`), la franja que se
  queda, lo que dice «Escúchame», el ancho del celular, que «Volver» borra la
  marca, y que a quien da clase no le cambia nada.
