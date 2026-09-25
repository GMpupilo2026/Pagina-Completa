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
- **Dentro de un grupo el orden también dice algo.** En "Aprender" va primero
  lo que se HACE (Entrenamiento), después lo que se mira de un vistazo para
  repasarlo (Estudio), después el curso completo y al final la lectura: Cursos
  estaba primero y es lo más largo de los cuatro, así que quien entra a
  practicar veinte minutos tenía delante lo que menos se parece a eso. En
  "Jugar y competir" va primero donde se juega contra otra persona (Juegos),
  después el torneo, y de último lo que se MIRA —TV en vivo no es jugar, es ver
  jugar—, con el bot y las medallas detrás.
- **Un mismo destino no va dos veces en el panel.** "Racha táctica" salió de
  "Jugar y competir" porque ya es lo PRIMERO que hay dentro de `juegos.html`,
  en una franja a todo el ancho: el segundo camino no se usa y de paso ensancha
  la grilla. Es el mismo error que el panel ya había cometido con "Torneos", y
  por eso mismo **"Torneos de la Academia" volvió a llamarse "Torneos"**: el
  nombre estaba largo para distinguirlo de la otra tarjeta que se llamaba
  igual, y esa otra es hoy "TV en vivo". El día que vuelva a haber dos, el que
  se renombra es el nuevo.
- **"Mide tu nivel" es lo que uno hace por su cuenta**, y se llamaba
  "Evaluaciones" con los exámenes adentro. Un examen te lo pone otra persona,
  con fecha y con nota; un diagnóstico lo hace uno cuando quiere, para saber
  dónde está parado. Ahí quedan los dos diagnósticos y nada más — y **el grupo
  entero es SOLO de administración**, ver abajo.
- **Un grupo del que no queda ni un acceso utilizable no se pinta.** A la
  alumna, "Herramientas" le salía como un encabezado y dos cuadros grises —sus
  dos accesos están en mantenimiento—: una sección entera de la página que no
  lleva a ninguna parte, que es la misma razón por la que se fue el
  "Próximamente" sin fecha. Un acceso apagado **entre otros que funcionan sí se
  queda**, y con su razón escrita: ahí uno vino por otra cosa y de paso se
  entera de que eso vuelve. No se esconde con una clase: no se pinta — un
  enlace invisible pero presente sigue siendo una parada de tabulador.
- **Los dos diagnósticos son SOLO de administración.** Estaban para todo el
  mundo, y eso era regalar las dos pruebas con las que el sitio ubica el nivel
  de alguien: los bancos —301 preguntas y 200 de reglamento— son archivos
  estáticos, así que cuanta más gente las resuelve por su cuenta, menos miden.
  Un diagnóstico se APLICA, no se practica.
  - Lo quita `diagnosticosSoloParaAdministracion()`, sobre la lista ya armada y
    en un solo lugar, igual que `apagarEnMantenimiento()`. Se quita el **grupo
    entero** y no sus dos tarjetas: un encabezado sin nada debajo es la misma
    sección muerta que ya se quitó de "Herramientas" para el alumnado.
  - Va **después** del `if` que le reapunta el destino al arbitraje, así quien
    administra lo conserva apuntando a `arbitraje.html` —la página con la
    revisión de los exámenes del público y el detalle pregunta por pregunta— y
    no a la versión pública. Y el grupo se queda **escrito en `TILE_GROUPS`**
    con sus dos tarjetas: definirlo dentro del `if` de un rol volvería a
    repartir el panel a pedazos.
  - **El diagnóstico de nivel sigue abierto al público sin cuenta** en
    `entreno/diagnostico.html`, que es una puerta de entrada al sitio y otra
    cosa: lo que se quitó es el camino desde el panel de quien ya está adentro.
    Lo mismo `nivel-de-arbitraje.html`, que es pública y enlazada desde la
    portada.
  - La comprobación que importa no es que el grupo no salga en la lista: es que
    **no quede ni un enlace a esas dos páginas en la grilla**, escondido o no —
    un enlace invisible pero presente sigue siendo una parada de tabulador.
    `verificar-panel.js` lo mira con las tres caras, y a administración le pide
    lo contrario: que SÍ se le pinten los dos, o se quedaría sin ninguna puerta.
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

Los tres números ya los devuelve `informes_resumen_alumnos()` —`puzzles`,
`lecciones`, `mejor_coord`— y, siendo `SECURITY INVOKER`, a un alumno le
devuelve **solo su propio renglón**: la misma función que usa `informes.html`,
así que la cuenta tampoco queda escrita dos veces.

De paso, **las tres tarjetas anchas apiladas** —récord de racha táctica, racha
de días y los tres números— quedaron en **una sola franja "Tu progreso"**, cada
número con su enlace. Eran mucho scroll para tres datos y para llegar al
registro de clases.

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
  de quitársela, y la que se olvide aparece. Los grupos son seis: «Cómo va la
  plataforma», «Cuentas y personas», «Cobros y accesos», «Resultados de las
  pruebas», «Revisar el contenido» y «Tu cuenta».
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
ahora mismo en la plataforma, poder ver quiénes son y escribirles, «tipo
burbuja adicional sin que estorbe en ningún lado»**. Es
`js/burbuja-en-linea.js`, una burbuja flotante abajo a la derecha que
`herramientas/academia-cabecera.py` pone en las páginas de la Academia.

**Tiene dos caras y las dos viven en el mismo archivo**, porque son el mismo
hilo visto desde sus dos puntas — escritas aparte se separarían a la primera
corrección, igual que `js/videollamada.js` o `js/subgrupos-marcar.js`:

- **Quien da clase** ve el conteo de sus alumnos conectados, quiénes son y en
  qué página andan, y le escribe a cualquiera sin salir de lo que estaba
  haciendo.
- **El alumno** recibe ese mensaje **en la página que tenga abierta** y
  contesta ahí mismo.

**Esa segunda mitad no es un adorno.** Hasta ahora el chat solo existía dentro
de `sesion.html`, que además exige clase abierta: un mensaje mandado a un
alumno que estaba entrenando no lo leía nadie. Se mandaba, se guardaba, y el
profesor se quedaba esperando una respuesta que nunca iba a venir. Un mensaje
que no llega no es un mensaje, y eso no da ningún error.

### El canal es POR PROFESOR, y lo que llega por él no se cree

Un canal de presencia de Supabase **no pasa por la RLS**: lo escucha —y se
anuncia en él— cualquiera que sepa su nombre. De ahí las dos decisiones que
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
  burbuja: la pantalla se vería perfecta y el fallo saldría recién al mandarle
  un mensaje que la RLS rechaza, sin que nadie entienda por qué. Se pide con
  `.in(ids)` sobre los conectados de ahora —nunca la tabla entera, que es la
  piedra de PostgREST— y quien la base no reconoce **no se pinta**.
- **Por el canal va lo justo: id, nombre y en qué página anda. El correo NO.**
  En la Academia son menores de edad y ese canal lo escucha cualquiera que sepa
  su nombre. El nombre viaja solo como respaldo; lo que se pinta sale de la base.
- **La página se dice con el `<title>`, no con el `pathname`.** «entreno/4x4.html»
  no le dice nada a quien lo lee; el título ya está escrito para leerse.

### "Conectado" quiere decir lo mismo que en el resto del sitio

Tener la pestaña abierta no es estar. `js/tiempo-plataforma.js` ya decidió qué
cuenta como activo —60 segundos sin un clic, una tecla o un scroll, o la
pestaña de fondo— y acá se usa **el mismo número**: al pasar de ahí se deja de
anunciar y al volver la actividad se vuelve a anunciar. Si no, la burbuja diría
«3 conectados» de gente que dejó la página abierta y se fue, el profesor le
escribiría y no contestaría nadie — que es peor que no tener el conteo.

### El mensaje no estrena tabla

Es `class_chat_messages`, la misma del chat de la clase en vivo y con la misma
RLS: el profesor escribe en el hilo de cualquier alumno suyo
(`soy_profesor_de(student_id)`), el alumno solo en el suyo. **Un mensaje es un
mensaje, no dos bandejas**: lo que se escribe desde la burbuja se lee en la
clase en vivo y al revés. No hizo falta ninguna migración para esto.

**Qué está leído vive en `localStorage`, y es del APARATO a propósito**, como
el tema o la clase elegida. Es un aviso, no un dato: en la base pediría una
columna que hay que mantener al día con cada lectura, y lo peor que pasa así es
que un mensaje ya leído en la compu vuelva a avisar una vez en el celular.

- **El profesor tiene una marca POR ALUMNO**, así que al arrancar pide los
  últimos mensajes y descarta acá. Con un `gt` sobre una marca sola se perdería
  el mensaje viejo de un alumno con el que no había hablado nunca. El alumno sí
  filtra en el servidor: su hilo es uno.
- **El alumno filtra el Realtime en el servidor** (`student_id=eq.<él>`); el
  profesor no puede —son N alumnos— y descarta en el cliente contra la lista
  que la base le reconoció.

### Que no estorbe es la mitad del pedido

- **Al alumno la burbuja SOLO se le pinta si tiene algo que leer.** No necesita
  saber quién está conectado, y un botón permanente sería justo el estorbo que
  esto no quiere ser. Al profesor se le queda siempre: el conteo es el dato, y
  «ahora mismo no hay nadie» también es una respuesta.
- **Un alumno sin ningún profesor no monta nada**: no hay a quién anunciarse ni
  de quién recibir. El aviso de «pide que te asignen un profesor» ya vive en el
  panel, que es por donde se entra.
- **Va en `z-40`, debajo del encabezado (`z-50`).** Si empataran, al desplegarse
  taparía el interruptor de tema.
- Escape la cierra **y devuelve el foco al botón**: un panel que se cierra
  dejando el foco en la nada deja perdido a quien usa teclado. El botón lleva
  `aria-expanded` y `aria-controls`, y el contador va en una región viva.
- **Dos páginas de la Academia se quedan SIN burbuja**, por razones distintas:
  `sesion.html`, que ya tiene el chat de la clase y su lista de conectados en
  un panel hecho para eso —la burbuja encima sería el mismo destino dos veces,
  el error que el panel ya cometió con «Torneos», y sobre un tablero—; y
  `examen.html`, que tiene reloj, una sola oportunidad por pregunta y pantalla
  completa: un panel que se despliega ahí es la distracción que el antitrampa
  viene a evitar, y el mensaje sigue estando cuando termine.
- El nombre de un alumno y el texto de un mensaje **los escribe una persona**,
  así que van siempre por `textContent` — la misma regla de la bitácora y de
  `renderStudentsList()`.
- **Y sobre todo: no ensucia ninguna.** Se agrega a 56 páginas que ya
  funcionaban, así que su arranque entero va en un `catch`: lo que falle se
  queda en una línea de consola y la burbuja no se monta. **Eso salió en la
  primera corrida**: los dobles de Supabase de media docena de verificadores no
  tienen canales de presencia, así que `sb.channel` no existía y el TypeError
  salía en la consola de `informes.html` —`verificar-notas.js` lo cazó por su
  comprobación de «sin errores en la consola»—. Un error suyo en la consola de
  una página que no tiene nada que ver con ella es donde se esconden los
  errores de verdad. Son **dos piezas y hacen falta las dos**: la salida limpia
  (`if (!sb.channel) return`, porque sin canales no hay nada que montar) y el
  `catch` detrás, que es la red. Está medido: con las dos puestas saltan las
  comprobaciones si se quitan las dos.
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
el nombre que salga sea el de la base; que el mensaje viaje al hilo de ESE
alumno y firmado por quien escribe; que al alumno sin mensajes **no se le pinte
ningún botón** (se mide `checkVisibility()`, no la clase); que se anuncie a
**sus dos** profesores y no solo al principal; que con la pestaña de fondo deje
de anunciarse; que un nombre con una etiqueta adentro no se ejecute **y se siga
viendo, literal**; y que la línea esté en todas las páginas de la Academia,
en ninguna de las dos exceptuadas, y con una ruta relativa que **llegue de
verdad al archivo** (un 404 ahí no avisa: la burbuja simplemente no aparece).

Comprueba además, con un cliente **sin canales de presencia**, que no se monte
y que **no deje ni un error en la consola** — que es lo que de verdad la hace
segura de poner en 56 páginas.

Está probado que falla de verdad: creyéndole al canal en vez de cruzar contra
`profiles` saltan 2 comprobaciones, anunciándose solo al profesor principal 1,
pintando el nombre con `innerHTML` 2, pintándole la burbuja al alumno sin
mensajes 1, y quitándole a la vez la salida limpia y el `catch` del arranque,
las 2 del cliente recortado.

## El panel de Administración

`admin.html` es de quien administra y tiene dos mitades: los atajos de arriba y
la lista de cuentas.

### Los atajos, por grupos

Eran ocho botones en una fila corrida, sin ningún criterio de orden —el
diagnóstico de los alumnos al lado de la base de datos de chess-results— y cada
uno con las mismas doce clases de Tailwind copiadas. Ahora salen de `ATAJOS`,
una lista con cuatro grupos: **Resultados** (los dos diagnósticos y los dos
exámenes, el de la Academia y el del público), **Formularios**, **Bases de
datos** y **Reportes**.

**Todos los formularios van juntos y primero**, en el grupo **Formularios**:
la encuesta de satisfacción con los profesores, las encuestas anónimas de
cursos (sin sesión y para lector de pantalla), el armador de formularios de
inscripción, las solicitudes de la Academia y las inscripciones a torneos en
línea. Antes estaban repartidos (en el panel de quien administra, las
solicitudes y el armador vivían dentro de «Cuentas y personas»). El panel de la
Academia de quien administra (`ADMIN_GROUPS` de `js/clases.js`) tiene el mismo
grupo, con las mismas cinco tarjetas en el mismo orden: son dos listas, y
cada una dice dónde está la otra.

- Las tarjetas son **más chicas** que las del panel de la Academia a propósito:
  acá son atajos de quien ya sabe lo que busca, no la puerta de entrada de un
  alumno.
- **"Informes de toda la plataforma" queda aparte y primero**, con su botón
  ámbar: es la puerta grande, y las tarjetas son atajos a un apartado suyo.
- Cuatro de los cinco atajos de Resultados llevan a `informes.html?tema=…`. Ese
  enlace directo **depende de que el tema exista en el selector de
  `informes.html`**: si se le cambia el nombre a una opción, el atajo lleva al
  resumen general sin decir nada. Por eso `verificar-admin.js` comprueba que
  cada atajo apunte a un archivo que existe y, si lleva `?tema=`, a un tema que
  el selector de verdad tiene.
- Se agregó el tema `diagnostico-publico`, hermano del de arbitraje público: los
  diagnósticos de visitantes ya salían dentro del tema `diagnostico` y en el
  resumen general, pero ahí hay que bajar a buscarlos, y son contactos para
  invitar a Academia — se consultan seguido.

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
