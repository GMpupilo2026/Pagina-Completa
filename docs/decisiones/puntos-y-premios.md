# Puntos Ajedrez: se acumulan y se canjean

## Por qué hacía falta un ledger nuevo y no alcanzaba con lo que ya había

Antes de esto, "los puntos de la clase" (`public.puntos_de_la_clase()`,
`public.puntos_de_tandas()`, `public.puntos_del_mes()`, todos de
`20261003044111_puntos_de_la_clase.sql` y `20261003045654_tanda_resultados.sql`)
se RECALCULABAN siempre desde `question_answers` y `tanda_resultados`, sin
ninguna historia más allá del mes en curso. Eso está bien para "cuánto
sacaste este mes", pero no sirve como moneda: no hay ningún número que se
pueda *gastar*, y recalcular todo el histórico de un alumno cada vez que
alguien pregunta su saldo se pone cada año más caro.

`public.trofeos_ajustes` (de `20260926195531_trofeos_de_la_clase.sql`) ya era
el patrón correcto para lo que faltaba: una tabla de solo apéndice (un
renglón por evento, nunca un contador que se pisa), sin política de
escritura, que solo toca una función `SECURITY DEFINER` con
`pg_advisory_xact_lock` para que dos ajustes a la vez no la dejen en
negativo. `public.puntos_ajustes` (`20261008054002_puntos_acumulados.sql`)
es ese mismo patrón, generalizado: cada renglón dice de dónde salió
(`origen`: clase, entrenamiento, tarea, examen, racha, canje, ajuste_manual)
y lleva una `referencia` opcional para no pagar el mismo evento dos veces.

## La idempotencia es la pieza que hace que esto sea seguro

`interno.otorgar_puntos(alumno, cantidad, origen, motivo, referencia)` hace
`insert ... on conflict (student_id, origen, referencia) where referencia is
not null do nothing`. Eso es lo que permite que:

- Cerrar una clase dos veces (si alguien reabre `ended_at` por error y lo
  vuelve a cerrar) no vuelva a pagar los mismos puntos: la referencia es
  `clase:<class_session_id>` por alumno, siempre la misma.
- Marcar y desmarcar una tarea completada varias veces solo paga la primera
  vez que llega a `completada`: la referencia es `tarea:<id>`.
- Un examen que se reabre (`congelado` → `en_curso` → `entregado` otra vez)
  no vuelve a cobrar: sigue siendo `examen:<id>`, el mismo id de siempre.

Las llamadas que SÍ deben poder repetirse sin deduplicarse (un canje, un
ajuste a mano futuro) pasan `referencia` con un valor nuevo cada vez
(`'canje:' || gen_random_uuid()`) o con `null` — el índice único es parcial
(`where referencia is not null`), así que esas filas nunca chocan entre sí.

## Qué fuentes de puntos se decidió cubrir, y qué se dejó afuera

- **Clase**: al cerrarla (`class_sessions.ended_at` pasa de `null` a una
  fecha), se suman `puntos_de_la_clase()` + `puntos_de_tandas()` +
  `puntos_de_habilidades()` (los ejercicios de Habilidades que el profe mandó
  a practicar, ver «Habilidades: los puntos» en `clase-en-vivo.md`) de esa
  clase, por alumno. **No** se incluyen los turnos de palabra, las prácticas
  ni las partidas de `js/puntos-clase.js` (`REGLAS`): esos números viven solo
  en `game_state` (podio, equipos), que se limpia al cerrar la clase — para
  sumarlos de forma confiable haría falta guardarlos en una tabla aparte
  antes de la limpieza, que es un cambio más grande y se deja para otra vez.
- **Entrenamiento**: de 1 a 6 puntos por cada ejercicio NUEVO, según su
  dificultad, sin tope por día; un ejercicio ya resuelto no vuelve a pagar
  (ver «Entrenamiento: según la dificultad, sin tope y una sola vez por
  ejercicio», abajo). Al principio eran 2 puntos por cada fila de
  `training_progress`, con un tope de 40 por día de Costa Rica.
- **Tareas**: 15 puntos por tarea completada. **Corregido después**: al
  principio lo pagaba un trigger sobre `tareas.estado`, pero esa columna
  quedó sin uso desde que una tarea se da por completada CALCULANDO sus
  renglones (`tareas_con_avance()`): el trigger nunca se disparaba y nadie lo
  notó, porque no da ningún error. Ahora la tarea se cobra en
  `reclamar_puntos_pendientes()` (ver «Retos, marcador, regalos y bromas»),
  solo las asignadas desde que existe Puntos Ajedrez (8/10/2026): pagar de
  golpe todas las viejas sería una sorpresa, no un premio.
- **Exámenes**: entre 5 y 20 puntos al entregarlo, según el `porcentaje` (un
  examen con 0 % igual da 5 puntos, por presentarse — es la única fuente que
  no premia SOLO el resultado).
- **Racha de días**: un bono por el hito más alto alcanzado (3, 7, 14, 30,
  60 o 100 días), reclamado al cargar el panel o la tienda (antes
  `public.reclamar_bono_racha()`, ahora dentro de
  `public.reclamar_puntos_pendientes()`). Solo se otorga el hito más alto, no
  todos los que se hayan pasado por el camino sin que nadie llamara a la
  función (una simplificación a propósito: no hace falta llevar la cuenta de
  cuáles ya se reclamaron en el cliente, la `referencia` de la base ya evita
  pagarlos dos veces).

## El multiplicador de «puntos dobles» vive en `otorgar_puntos()`, no en cada fuente

`doble_puntos_dia`/`doble_puntos_semana` son premios que, al canjearlos,
dejan una fila en `premios_canjeados` con `vigente_hasta` en el futuro.
`interno.otorgar_puntos()` mira, en cada llamada con `origen` distinto de
`'canje'` y `'ajuste_manual'`, si hay un `doble_puntos` vigente para ese
alumno, y si lo hay dobla la cantidad ANTES de insertar. Así el multiplicador
se aplica una sola vez, en un solo lugar, sin que cada trigger (clase,
entrenamiento, tarea, examen, racha) tenga que saber que existe.

## Por qué el canje reutiliza `course_unlocks` y `compras_tienda` en vez de crear candados nuevos

Se investigó primero si "abrir un capítulo de un curso" necesitaba una
granularidad por lección que no existe (el contenido protegido de un curso
es un solo archivo con todas las lecciones juntas). **No hacía falta
construirla**: `public.course_unlocks` (de `20260916003059_course_unlocks.sql`)
ya existe para esto — un profesor la usa desde `informes.html` para
"Desbloquear hasta el tema" de un alumno puntual, con un `upsert` directo
(sin función, porque sus políticas de escritura ya exigen `soy_profesor_de`
o `is_admin`). `public.canjear_premio()` hace el mismo `upsert`, pero
`SECURITY DEFINER`, así que lo ejecuta como su dueño y pasa por encima de esa
RLS — es una tercera vía de escritura además del profesor y quien
administra, pensada a propósito (el alumno nunca tiene permiso directo sobre
`course_unlocks`; solo puede pedirle a `canjear_premio()` que la toque por
él, y esa función sí valida el saldo).

Lo mismo con `compras_tienda`: `public.registrar_compra()` exige ser admin
porque está pensada para que alguien registre a mano un pago por WhatsApp.
`canjear_premio()` inserta en la misma tabla directamente (no llama a
`registrar_compra()`), como una vía distinta y propia para un «pago» con
puntos en lugar de dinero. El resultado para `puede_bajar()`/`worker.js` es
exactamente el mismo: da igual por cuál de las dos vías se compró.

### El material canjeado se abre desde «Mis premios»

**Corregido después.** El candado quedaba abierto, pero no había puerta: la
fila de «Mis premios» decía «Canjeado el…» y nada más, y `tienda.html` (la
única pantalla con los enlaces a cada material) es solo de administración. Un
alumno canjeó el libro de diagnóstico por 500 puntos el 13/10/2026, la base le
registró la compra, el worker se lo habría dejado bajar, y no tuvo por dónde
llegar; se le devolvieron los puntos a mano (`ajuste_manual`, con la
referencia `devolucion:canje:<id>`). Ahora la fila de un `material_tienda`
trae un enlace por cada archivo del producto, sacados de
`js/tienda-catalogo.js` (la misma lista que la tienda, que
`verificar-tienda.js` compara contra el disco), así que un material nuevo en
el catálogo de premios sale con sus enlaces sin tocar `js/puntos.js`. Lo
revisa la prueba «4 bis» de `verificar-puntos.js`.

## Los accesorios de avatar: lo único que otros alumnos (no solo quien lo tiene) llegan a ver

Los títulos y los marcos de perfil solo se ven en el panel y la tienda de
quien los tiene — motivadores, pero privados. Se agregó una categoría más
(`20261008055743_puntos_accesorios_avatar.sql`) pensada para que SÍ se note
delante de otros: un emoji pequeño (gorro, lentes, una corona…) encima de la
foto de perfil, en los lugares donde la foto de uno ya la ven otras
personas. El primer lugar donde se conectó fue el más visible de todos: la
lista «Alumnos conectados» que ve el profesor en la clase en vivo
(`js/sesion.js`, `renderStudentsList()`).

- `public.accesorios_de(ids uuid[])` pide el accesorio de VARIOS alumnos de
  una vez (`SECURITY INVOKER`: la RLS de `premios_canjeados` decide qué filas
  puede ver quien llama, igual que todo lo demás de este archivo) — un
  listado de alumnos conectados no puede pedir uno por uno sin volverse
  lento.
- `Puntos.decorarAvatar(caja, accesorio)` (en `js/puntos.js`) pone esa
  insignia encima de la caja que arma `FotoPerfil.avatar()`/`poner()`. **No
  la agrega DENTRO de la caja**: la caja recorta a círculo (`overflow-hidden`
  + `rounded-full`, para que la foto no se salga del redondel), y la esquina
  de un cuadrado siempre cae FUERA del círculo inscrito en él —una insignia
  metida ahí adentro queda en el DOM con el emoji correcto, pero invisible
  de verdad, recortada junto con la foto—. Así estuvo desde que se agregó
  esta categoría, sin que nadie lo notara (ni el profesor llegó a verla
  nunca en «Alumnos conectados»): se encontró revisando cómo se veía en el
  celular lo de «Los compañeros también lo ven», de acá abajo. La corrección
  envuelve la caja en un `<span>` aparte, sin recortar (se arma una sola vez
  por caja; si ya estaba envuelta de una decoración anterior, se reusa), y
  ahí es donde va la insignia — la caja original, con su `data-foto-de`,
  sigue siendo la misma, así que `querySelectorAll("[data-foto-de]")` la
  sigue encontrando igual.
- `Puntos.accesoriosDe(sb, ids)` tiene memoria de página con un vencimiento
  de 60 segundos (no sin vencer: un alumno se puede quitar el accesorio a
  mitad de clase desde la tienda, en otra pestaña, y la lista del profesor no
  debería quedar mostrando uno que ya no está puesto).
- La decoración se pide DESPUÉS de pintar la lista entera (no antes): así un
  accesorio que tarda en llegar no atrasa nada más, y como la lista se
  vuelve a pintar con cada latido de presencia, lo peor que pasa es que se
  vea un instante más tarde.

**Los compañeros también lo ven, no solo el profesor** (desde
`20261011161244_premios_accesorios_companeros.sql`): el texto del catálogo
siempre dijo «que ven tu profesor y tus compañeros», pero hasta esa
migración la RLS de `premios_canjeados` solo dejaba ver la propia fila, la
del profesor, la de quien administra o la de quien supervisa —a un
compañero ni `accesorios_de()` le devolvía nada, aunque la función ya
estuviera pensada para pedir de varios a la vez—. Se notó porque alguien
canjeó la Corona dorada y sus compañeros de clase no la veían.

- La política `premios_canjeados_ver` suma una rama más: si la fila es de
  `tipo_efecto = 'accesorio_avatar'` Y el que pregunta es compañero (mismo
  conjunto que la rama de compañeros de `profiles_select`: mismo profesor Y
  misma academia, por `interno.profesores_de()` + `interno.alumnos_de()` +
  `interno.gente_de_mis_academias()`), se deja ver. Los títulos, los marcos
  de perfil y todo lo demás de `premios_canjeados` siguen sin verse entre
  compañeros: la excepción es solo para `accesorio_avatar`, que es la única
  categoría pensada para notarse delante de otros.
- `js/sesion.js` reutiliza `onlineStudents` (ya lo llena `subscribePresence`
  para TODOS los que están en el canal, alumno o profesor) con una función
  nueva, `renderCompanerosList()`, que pinta en `#companeros-caja` (dentro
  de `#student-panel`, el panel que ya veía un alumno) a sus compañeros
  conectados con su foto y su accesorio — sin ningún control, eso sigue
  siendo solo de `renderStudentsList()` (el profesor). Mismo patrón que la
  lista del profesor: `Puntos.accesoriosDe()`/`Puntos.decorarAvatar()`
  llegan después de pintar la lista, con la misma memoria de 60 segundos.
  La caja queda oculta si todavía no hay compañeros conectados. A uno mismo
  no se lo lista ahí (`renderCompanerosList()` se filtra a sí mismo): su
  propia foto, decorada con su propio accesorio, va aparte en
  `#mi-foto-caja` (`pintarMiFoto()`), arriba del todo en `#student-panel` —
  así ve lo mismo que ya ven sus compañeros y su profesor de él mismo.
- **Comprobado impersonando roles en SQL** (11/10/2026, sobre una Corona
  dorada canjeada de verdad): un compañero de mismo profesor y academia que
  pide `premios_canjeados`/`accesorios_de()` de quien la tiene recibe SOLO
  sus 5 filas `accesorio_avatar` (ni los títulos ni los marcos, que son 5
  filas más de la misma persona); alguien sin profesor en común recibe cero
  filas. **Queda pendiente** un verificador de Playwright para esto (los
  de `verificar-puntos.js` solo abren `puntos-tienda.html`, no
  `sesion.html` con dos alumnos a la vez): por ahora se apoya en la
  impersonación de arriba y en que la política sigue, fila por fila, el
  mismo candado y forma que las demás ramas ya probadas.

Queda para otra vez: que un accesorio se vea también en el modo proyector.

## Retos, marcador, regalos y bromas

La segunda parte está en `20261008173204_puntos_retos_marcador.sql` y
`20261008173205_puntos_regalos_bromas.sql`. **El nombre de un archivo de
migración tiene que ser la versión que quedó en la base**, no otra: si no,
la huella del punto de restauración no coincide, que es lo que pasó con las
dos primeras (se llamaban `150000`/`160000` y en la base eran
`054002`/`055743`).

**Si `apply_migration` vuelve «cancelled».** Estas dos se cancelaron varias
veces aunque el dueño las había aprobado. Tienen `drop` (de funciones que
cambian lo que devuelven, de una restricción, del trigger muerto), y la
herramienta pide una confirmación aparte que en la sesión web nunca le llegó;
hasta un `insert` con ese texto adentro se colgaba. Se corrieron a mano en el
editor SQL de Supabase. Como el editor no anota en
`supabase_migrations.schema_migrations`, después se agregó cada renglón con
su texto exacto (`statements` = el archivo entero), así su md5 da lo mismo
que el del archivo. Se comprobó todo en la base antes de seguir.

**Lo pendiente se cobra al abrir, no con un trigger.** Una tarea completada,
un hito de racha y un reto cumplido no tienen un momento propio en la base:
se calculan. `public.reclamar_puntos_pendientes()` los revisa a los tres al
abrir el panel o la tienda y devuelve solo lo NUEVO (`otorgar_puntos()` ahora
devuelve cuánto pagó, 0 si ya estaba), que es lo que se anuncia. Llamarla mil
veces paga una: cada cosa tiene su `referencia` (`tarea:<id>`,
`racha:<hito>`, `reto:<id>:<lunes>`).

**Retos de la semana.** De lunes a domingo en hora de Costa Rica, en
`public.retos_semanales` (solo los edita administración): 30 ejercicios
(+40), 4 días con al menos 5 ejercicios (+60) y 2 tareas (+30). El avance lo
cuenta `interno.avance_reto()`; la página lo escribe («12 de 30»), no solo en
la barra. Los puntos dobles también doblan el bono.

**El marcador del salón** responde a «No hay tabla de posiciones para los
alumnos» (ver `clase-en-vivo.md`): aquella vez no la había porque habría sido
una lista que no pasa por una relación directa. `public.marcador_del_salon()`
sí pasa por una: a un alumno le muestra a sus **compañeros** —mismo profe Y
misma academia, el mismo conjunto que la rama de compañeros de
`profiles_select`—; al profe, a sus alumnos; a quien administra, a todos.
Suma solo lo GANADO en la semana o el mes: lo gastado en canjes, regalos y
bromas no resta, para que regalar no castigue. Sale quien sumó algo, y uno
mismo siempre (marcado con `aria-current`).

**Regalos.** `public.regalar_premio()` compra para un compañero
(`es_companero()`) una tarjeta (estrella, flores, trofeo, pastel, caballito)
o un cosmético o ventaja de la tienda; el contenido (cursos, materiales) no se
regala. El mensaje se ELIGE de `public.frases_regalo`: nada de texto libre
entre alumnos, que en su mayoría son menores. Un cosmético regalado llega
guardado (lo pone quien lo recibe, si quiere). Tope: 10 regalos al día.
Llega a la campana del panel (`regalos_y_bromas_recientes()`) y al celular
(`avisar_push`, dentro de un bloque de excepción: si el aviso falla, el
regalo no se deshace). `canjear_premio()` rechaza las tarjetas y las bromas:
son para otro.

**Bromas.** Cinco, todas visuales, inofensivas, que se van solas y SIEMPRE con
el nombre de quien la manda (`js/bromas.js`): confeti y un globo con una frase
de la lista en el panel (una vez), un patito que cruza la pantalla y el
tablero arcoíris en Entrenamiento (una hora), y un gorro de payaso sobre la
foto (un día; lo pinta `accesorios_de()`, así que también lo ve el profe en
«Alumnos conectados»). Las reglas, en la base (`mandar_broma()`):

- nunca a quien tiene su visión marcada (`vision_personas`), y el mensaje de
  rechazo es el mismo para todo, sin decir por qué: la visión es un dato de
  salud y un bloqueo no se anuncia;
- quien recibe puede no recibir ninguna (`bromas_configurar`) o bloquear a
  alguien (`bromas_bloquear`), desde la tienda;
- el profe las apaga para toda su clase en Configuración
  (`bromas_en_mi_clase`); basta con que lo haga el profe de uno de los dos;
- topes por día: una por pareja, 5 de quien manda, 3 de quien recibe
  (desde el 24/10/2026: 3, 10 y 10; ver «Dónde cae una broma y la clase en
  vivo»).

Y las de la página: `js/bromas.js` solo se carga en el panel, la tienda y
Entrenamiento (`herramientas/academia-cabecera.py`), nunca en un examen, la
clase en vivo, un torneo ni el diagnóstico (la clase en vivo entró después,
con el profe que las enciende: ver «Dónde cae una broma y la clase en
vivo»); con Modo Adaptado o el panel para
quien no ve no se pinta nada; con «menos movimiento» queda el aviso y nada se
mueve. Los colores del arcoíris están medidos: cada par tiene la misma
luminancia que el tablero de siempre, así que el contraste entre casillas y
con las piezas no cambia, solo el tono. La animación le gana al estilo en
línea que `board-color-themes.js` pone sobre `<html>`.

## Las bromas grandes

`20261024160609_bromas_grandes.sql` suma diez bromas a la tienda, pedidas por
el dueño del sitio con su dibujo de referencia: «¡Invasión de gallinas!»,
«Pantalla empapelada», «Meteorito troll», «Llegó el payaso», «Pato invasor»,
«¡Gato descontrolado!», «¡Lluvia de quesos!», «¡Platanazo!», «¡Abducción
alienígena!» y «¡Sandía explosiva!». Pidió tres cosas, y así quedaron:

- **Más caras**, para que haya que hacer más ejercicios: de 80 a 150 puntos
  (las cinco primeras cuestan de 20 a 60, y el entrenamiento pagaba
  entonces a lo sumo 40 por día), así que cada una eran de dos a cuatro días
  de práctica. Desde el 24/10/2026 el entrenamiento no tiene tope, pero cada
  ejercicio paga una sola vez.
- **Más tiempo en pantalla**: unos 12 segundos (el confeti dura 5).
- **Grandes**: el dibujo principal ocupa hasta un tercio del ancho
  (`clamp(8rem, 32vw, 18rem)`; el payaso, más) y el cartel con el nombre va
  en letra grande. Los dibujos son emojis, como las cinco primeras: no pesan
  nada y se ven en cualquier aparato.

Todo lo demás es lo de las primeras: **son de una vez**, como el confeti
(salen la próxima vez que entra a su panel, tienen una semana para verse y se
marcan vistas), así que `mis_bromas()` y `mandar_broma()` no cambiaron —las
reglas de quién puede recibir qué y los topes del día siguen siendo las
mismas—; solo se ensanchó `bromas_tipo_check` y se agregaron las filas de
`premios_catalogo`. Dicen quién la mandó dos veces: en el aviso (que es el que
se anuncia, `role="status"`) y en el cartel de la capa (que es adorno,
`aria-hidden`). Con Modo Adaptado no salen; con «menos movimiento» queda solo
el aviso.

- **De a una.** Si llegan varias juntas, salen una detrás de otra (`fila` en
  `js/bromas.js`): diez escenas encimadas no se entienden. Por eso cada una se
  marca vista cuando EMPIEZA, no al llegar: si se cierra la página a la mitad
  de la fila, las que faltaban salen la próxima vez.
- **Con sonido, bajito.** El payaso trae su musiquita (la «Entrada de los
  gladiadores», de 1897, de dominio público) y el pato su «cuac»; también el
  ovni, el meteorito y la sandía hacen un ruido. Son notas de WebAudio a poco
  volumen, sin archivos. El navegador no deja sonar una página que nadie ha
  tocado todavía, así que muchas veces no suenan: la broma se ve igual, el
  sonido es un extra, nunca la broma.
- **El ovni se lleva una pieza de verdad** (lo pidió el dueño después,
  `20261024163126_broma_ovni_pieza.sql`, que solo cambia lo que dice la
  tienda). Por eso es la única grande que no sale en el panel sino en
  Entrenamiento, la primera vez que hay un tablero con piezas a la vista
  (espera hasta 30 segundos a que cargue el ejercicio; si no aparece, queda
  sin ver para la próxima página). Baja sobre una pieza al azar —nunca un
  rey—, la copia sube por el rayo y la de verdad deja de verse **un minuto**:
  hay que acordarse de cuál era. **La pieza sigue en juego** (lo aclaró el
  dueño): se puede mover, solo que no se ve, y escondida sigue en su casilla
  nueva. Al minuto vuelve, con un aviso que dice cuál era y dónde está. Se
  esconde con una regla de CSS sobre una casilla de ese tablero, no tocando la
  pieza, porque los tableros se vuelven a pintar enteros en cada jugada y la
  regla sobrevive. Para seguirla, un `MutationObserver` mira el tablero cada
  vez que se pinta (antes del siguiente cuadro, así que no parpadea): la
  casilla que ahora tiene esa pieza y antes no, es la nueva. Si se la comen
  o cambian muchas casillas de golpe (otro ejercicio), deja de esconderse.
  La casilla se sigue pudiendo tocar (la jugada se hace de memoria), y el
  lector de pantalla la sigue nombrando: el Modo Adaptado ya no recibe
  bromas. Si cambia de página antes del minuto, en la nueva la pieza se ve.
- **El cartel**, blanco sobre el azul de la marca (#ffffff sobre #102a43,
  14,7 a 1), con el borde dorado.

`verificar-bromas.js` las revisa: que la base, `js/bromas.js` y la tienda
(`NOMBRE_BROMA`) conozcan las diez, el contraste del cartel, que salen de a
una y que la segunda espera a la primera, que el cartel dice quién la mandó,
que el ovni esconde UNA pieza aunque el tablero se vuelva a pintar, que
sigue escondida cuando se mueve, y la devuelve al minuto (con el reloj de
Playwright, sin esperar de verdad),
que las gallinas miden más de 60 px, que la capa no tapa los clics ni la lee
el lector de pantalla, y que con «menos movimiento» solo queda el aviso. Con
`FOTOS=<carpeta>` saca una foto de cada una a media animación, para mirarlas.

## Dónde cae una broma y la clase en vivo

Pedido por el dueño del sitio el 24/10/2026: que quien manda la broma elija
dónde le cae —en la clase, mientras entrena—, que quede programada para
cuando la persona hace el ejercicio, que pueda ir con sonido, y que se pueda
mandar en la clase mientras el compañero hace un ejercicio, para que le
cueste concentrarse. Y de paso: al menos 10 por día y todo más caro. Lo hace
`20261024193832_bromas_donde_y_clase.sql`.

- **Esto da vuelta una regla de arriba** («nunca en la clase en vivo»). Se le
  preguntó al dueño quién decide en la clase y en qué actividades, y eligió:
  **el profe las enciende** para su clase (vienen apagadas) y valen **en
  todo menos exámenes y torneos**, que siguen sin cargar `js/bromas.js`. En
  la clase eso incluye la competencia, el calentamiento, el cuestionario y
  la práctica con reloj, aunque den puntos: provocar que pierda es justo lo
  que se pidió.
- **`bromas.donde`** (`panel`, `entreno` o `clase`) lo elige quien la manda
  en el mismo diálogo de siempre («¿Dónde le cae?», `js/puntos-regalos.js`).
  El gorro de payaso no tiene lugar (es la foto); el patito, el arcoíris y el
  ovni necesitan un tablero, así que no van al panel: lo valida
  `mandar_broma()`. Las viejas quedaron con su lugar de antes.
- **Programada**: `js/bromas.js` toma las que son para la página donde está
  y las deja esperando (`pendientes`, revisadas cada segundo) hasta que
  haya un ejercicio: en el panel, al entrar; en Entrenamiento, un tablero con
  piezas a la vista; en la clase, las bromas encendidas y alguna caja de
  actividad visible (`#question-card` —preguntas, ronda, cuestionario,
  votación—, `#practice-card`, `#calentamiento-caja`, `#tanda-caja`,
  `#formacion-tarjeta`, `#pensar-aviso-caja`). No hay en `sesion.js` una
  señal común de «actividad abierta», así que se mira cuál de esas cajas se
  ve (`checkVisibility()`). Se marca vista cuando SALE, no al llegar.
- **El interruptor del profe** (`js/clase-bromas.js`, al final de «Alumnos
  conectados»; no en la barra «Tu material», que tiene sus botones contados
  en `verificar-sesion-orden.js`): `bromas_en_esta_clase()` escribe
  `bromas_clase.hasta`, tres horas, o la hora de ahora para apagarlas. Se
  apagan solas a su hora. Lo lee la página de quien recibe, por la RLS de
  `bromas_clase` (sus profes): saltarse ese candado desde la consola solo le
  hace la broma a uno mismo. Lo que de verdad protege a los demás sigue en
  la base: `bromas_en_mi_clase` (el apagado de siempre, para todos sus
  alumnos), la visión marcada, las preferencias y los bloqueos.
- **Mandarla desde la clase**: con las bromas encendidas, el alumno tiene
  «🎭 Mandar una broma» en su panel; elige la broma y luego el diálogo de
  siempre, con el lugar ya puesto en «clase». Después avisa por el canal
  `bromas-clase:<profe>` (broadcast) y la página del compañero vuelve a
  preguntarle a la base (`mis_bromas`). Un aviso inventado no trae nada que
  la base no tenga. Por si se pierde, cada minuto vuelve a preguntar
  mientras las bromas estén encendidas.
- **Sonido**: `bromas.con_sonido`, «Con sonido y efectos» o «Solo efectos».
  Ahora todas suenan (notas de WebAudio, bajitas). En la clase sí suenan casi
  siempre: el alumno ya tocó la página; al entrar al panel muchas veces el
  navegador no deja.
- **Topes**: 10 que manda cada uno y 10 que recibe por día; con el mismo
  compañero, 3 (para que nadie se ensañe con uno solo).
- **Precios**: el triple. De 60 (el globo) a 450 (el payaso gigante).
- **Lo que no se borró**: `mandar_broma()` y `mis_bromas()` cambiaron de
  firma, y borrarlas hacía que `apply_migration` pidiera una confirmación que
  en la sesión web no llegó (dos veces, igual que en «Retos, marcador,
  regalos y bromas»). Las viejas se renombraron (`mandar_broma_v1`,
  `mis_bromas_v1`) y se les quitó el permiso: no las llama nadie. Por lo
  mismo, apagar las bromas de la clase pone la hora de ahora en lugar de
  borrar la fila.
- **El pato invasor** cruza por encima del tablero (si hay uno), creciendo de
  0,5 a 2,6 veces y cambiando de color (`hue-rotate` en el pato, no en su
  globo, que conserva su contraste); en el centro del tablero se para, dice
  «¡CUAC! ¿Esa era tu jugada?», sacude el tablero y pone un huevo del que
  sale un pollito. Lo mueve Web Animations, con las posiciones del tablero.

`verificar-bromas.js` lo revisa: que `sesion.html` carga `js/bromas.js`,
`js/clase-bromas.js` y `js/puntos-regalos.js` (y examen, torneo y
diagnóstico siguen sin bromas); que una broma «solo efectos» no intenta
sonar y una «con sonido» sí; que una para Entrenamiento o la clase no sale
en el panel ni se marca vista, y una para Entrenamiento sale con el
ejercicio; y, en una página mínima servida en `/sesion.html`, que en la clase
no sale con las bromas apagadas, ni encendidas sin una actividad abierta, y
sí al abrirse una pregunta. Se rompió a propósito (el sonido, el candado de
la clase) y saltó. `verificar-puntos.js` revisa que el diálogo pregunte dónde
y si suena, y que la llamada los lleve.

## Las bromas del profe

Pedido por el dueño del sitio el 26/10/2026: «que el profe pueda mandar
bromas a los alumnos». Lo hace `20261026230948_bromas_del_profe.sql`.

- **La misma función, no otra.** `mandar_broma()` se volvió a escribir con
  `create or replace` y la MISMA firma (cambiarla obliga a renombrar la vieja,
  ver «Lo que no se borró»). Suma un camino: si quien la manda es profesor
  de quien la recibe (`soy_profesor_de()`), no hace falta que sean
  compañeros. Sale en la misma tabla `bromas`, así que quien la recibe la ve
  igual que cualquier otra (`mis_bromas()`, la campana) y con el nombre del
  profe.
- **Gratis.** El profe no junta Puntos Ajedrez: su broma no se cobra ni
  anota nada en `puntos_ajustes`, y `saldo_restante` vuelve nulo. Por eso
  el diálogo del profe no muestra precios.
- **Los mismos frenos de quien la recibe**, con el mismo mensaje que no
  dice por qué: la visión marcada, «no quiero recibir bromas» y el bloqueo
  (el alumno puede bloquear a su profe desde la tienda como a cualquiera; la
  casilla dice ahora «de mis compañeros y de mi profe»).
- **El apagado** (`bromas_apagadas`, en Configuración) es para las bromas
  ENTRE sus alumnos: el del propio profe no lo frena a él. El de otro profe
  del mismo alumno, sí: basta con que uno no quiera.
- **Topes**: 3 por día al mismo alumno y 10 que recibe cada alumno (los de
  siempre); lo que manda el profe en un día, 30, porque tiene una clase
  entera.
- **Quien administra no entra por aquí**: no da clase (ver «El panel de
  quien administra no es el de un profesor»). Si quiere ver cómo se ve, lo
  hace con «Ver como: profesor».
- **Dónde**: en Configuración, en la caja «Bromas entre tus alumnos», el
  botón «Mandarle una broma a un alumno» (elige cuál, a quién —de
  `alumnos_del_profesor()`, no de `profiles`—, dónde le cae y si suena); y
  en la clase en vivo, con las bromas encendidas, «Mandarle una broma a un
  alumno» debajo del interruptor de «Alumnos conectados», que la deja en la
  clase y avisa por el canal `bromas-clase:<profe>` como la de un alumno.
  Las dos usan `PuntosRegalos.regalar({ …, profe: true })`: una sola copia
  del diálogo.

Se probó en la base impersonando roles (y deshaciendo): el profe la manda a
su alumno sin que se le cobre nada, aun con su propio apagado puesto; el
alumno la ve en `mis_bromas()`; un profe que no es suyo recibe «Solo se le
pueden mandar bromas a un compañero de clase o a un alumno tuyo.»; la cuarta
del día al mismo alumno se rechaza; con la visión marcada se rechaza; y entre
compañeros sigue cobrando (75 puntos el confeti).

`verificar-bromas-profe.js` revisa la página: que Configuración carga
`js/puntos-regalos.js` y manda con `profe: true`; que la lista del profe sale
de `alumnos_del_profesor` (y no lee `profiles`), sin precios, y la llamada
lleva a quién, dónde y si suena; y que en la clase el botón del profe no se
ve con las bromas apagadas, se ve al encenderlas, no ofrece el gorro de
payaso y la manda a la clase. Se rompió a propósito (la lista, el botón
siempre visible) y saltó.

## La semana sin entrenar: se pierde la mitad

Pedido por el dueño del sitio el 24/10/2026: «después de una semana, quien
no haya entrenado al menos 4 días pierde la mitad de sus puntos».
Migración `20261024172538_puntos_semana_sin_entrenar.sql`.

- **La semana** es de lunes a domingo en hora de Costa Rica, la misma de los
  retos. **Un día cuenta** si tiene al menos un ejercicio en
  `training_progress` (`interno.dias_entrenados()`). El reto «Cuatro días de
  entrenamiento» pide 5 por día; aquí se eligió la vara más baja porque esto
  es un castigo, no un premio. La clase en vivo no cuenta como entrenar.
- **Lo cobra la base, no la página**: pg_cron
  (`puntos-semana-sin-entrenar`, lunes 06:10 UTC = 00:10 en Costa Rica) corre
  `interno.cobrar_semana_sin_entrenar()`, que anota `-floor(saldo / 2)` con
  origen `semana_sin_entrenar` y referencia `semana:<lunes>`: correrla dos
  veces no cobra dos veces. Lee el saldo con el mismo candado que los canjes
  (`pg_advisory_xact_lock(hashtext('puntos:' || id))`). Si un lunes el cron no
  corre, esa semana no se cobra (no se recupera sola); a mano:
  `select * from interno.cobrar_semana_sin_entrenar('<lunes>')`.
- **A quién**: solo `role = 'alumno'`, con al menos 2 puntos, y cuya cuenta
  existía el lunes en que empezó la semana (a quien entró el jueves no se le
  pueden pedir 4 días).
- **Arranca la semana del lunes 26/10/2026** (primer cobro el lunes 2/11).
  Cobrar una semana en la que nadie sabía de la regla sería una sorpresa, no
  una regla, como se decidió con las tareas viejas. Antes de aplicarla se
  midió con la semana del 12 al 18/10: de 150 alumnos con puntos, 136 no
  llegaban a 4 días (unos 30.000 puntos). Ensayada en una transacción que se
  deshizo: cobró a 129 (los demás tenían cuenta nueva o menos de 2 puntos),
  ninguno con 4 días o más, y una segunda pasada no cobró nada.
- No pasa por los puntos dobles (solo doblan lo positivo), y el marcador del
  salón suma solo lo ganado: perder la mitad no mueve el marcador.
- **Se avisa con tiempo**: `public.semana_de_entrenamiento()` le dice al
  alumno cuántos días lleva, cuánto se juega (la mitad de su saldo de ahora)
  y lo que perdió la semana pasada. La tarjeta del panel y la sección «Entrena
  4 días cada semana» de la tienda lo escriben con el número («llevas 2 de 4
  días… pierdes la mitad de tus puntos (50 puntos)»), y cuando ya no alcanzan
  los días que le quedan a la semana, lo dicen. En el historial sale con su
  motivo («Semana del 26/10: entrenaste 2 días de 4. Pierdes la mitad.»).
  Lo comprueba `verificar-puntos.js` (prueba 12).

## Entrenamiento: según la dificultad, sin tope y una sola vez por ejercicio

Pedido por el dueño del sitio (24/10/2026): quitar el tope de 40 puntos por
día, que lo sencillo pague menos que lo difícil, y que un ejercicio ya hecho
no vuelva a pagar. Lo hacen `20261024172848_puntos_entrenamiento_por_dificultad.sql`
y su arreglo `20261024172944_puntos_entrenamiento_filas_juntas.sql`, todo en
el trigger `otorgar_puntos_de_entrenamiento()`: las páginas no cambian.

- **El tope era el único freno contra repetir un ejercicio fácil en bucle.**
  Al quitarlo, el freno pasa a ser la regla de «una sola vez»: sin ella, el
  mismo mate en uno resuelto cien veces daba cien veces sus puntos.
- **Qué es «el mismo ejercicio»** lo dice `interno.entrenamiento_clave()`:
  la actividad y el id que ya trae el `detail` (`puzzle_id`, `lesson_id`,
  `linea_id`, `final_id`, `nivel_id`, `set_id`; curso y lección en `curso`;
  curso y diagrama en `finales100`; juego, nivel y ejercicio en
  `concentracion`). Los juegos que no tienen ejercicios con id —Coordenadas,
  Confites, Memoria, Sonar, Batalla naval, el diagnóstico, Precisión
  posicional— se juegan una y otra vez por naturaleza: ahí «el mismo» es la
  misma variante (nivel, modo, piezas) **el mismo día** de Costa Rica, así
  que pagan una vez por día y variante. Sin eso, Confites en bucle era una
  fuente infinita de puntos en cuanto se quitó el tope.
- **Cuánto paga** lo dice `interno.entrenamiento_premio()`, con la dificultad
  que ya guarda cada actividad (nada nuevo que mandar desde las páginas):

  | Actividad | Puntos |
  |---|---|
  | 4×4 | Fácil 1, Intermedio 2, Avanzado 3, Especialista 4, Maestro 5, Gran Maestro 6 |
  | Mates | mate en 1: 1, en 2: 3, en 3: 5 |
  | Temas (rating de Lichess) | < 1000: 1, < 1300: 2, < 1600: 3, < 1900: 4, < 2200: 5, más: 6 |
  | Tipos, Concentración, Sonar, Batalla naval | su nivel, de 1 a 5 |
  | Memoria | hasta 4 piezas 1, hasta 6: 2, hasta 8: 3, más: 4 |
  | Finales de un curso (`finales100`) | 3; en el nivel «max», 5 |
  | Finales, lección de un curso | 3 |
  | Diagnóstico | 5 (una vez por día) |
  | Aprender, Ilumina, Coordenadas, Confites | 1 |
  | Lo demás (Táctica, Aperturas, Practicar, Visualización…) | 2, lo mismo que antes |

  Una actividad nueva entra sola con 2 puntos; si trae su dificultad, se
  agrega su renglón en `entrenamiento_premio()`.
- **«Ya hecho» mira TODO `training_progress`**, también lo de antes del
  cambio: un ejercicio resuelto hace un mes no paga de nuevo, aunque en su
  día el tope viejo lo dejara sin nada. Para que mirarlo no recorra las
  miles de filas de un alumno hay un índice sobre la clave
  (`training_progress_clave_puntos`); por eso `entrenamiento_clave()` es
  `immutable` y `authenticated` la puede ejecutar (el alumno que inserta su
  fila mantiene el índice). Es un cálculo puro: no lee ninguna tabla.
- **Un intento fallido no cuenta**: `finales100` con `ok = false` y Batalla
  naval con `gano = false` (`entrenamiento_logrado()`) no pagan ni cuentan
  como hechos; al lograrlo después, paga.
- **La referencia del ledger es `'entrenamiento:' || clave`** (antes,
  `'entrenamiento:' || id de la fila`): el índice único de `puntos_ajustes`
  impide pagar dos veces aunque dos filas del mismo ejercicio lleguen a la
  vez. Las referencias viejas son un uuid y nunca chocan con las nuevas, que
  empiezan por la actividad. Lo ya pagado no se tocó.
- **Lo que falló callado en la primera versión**: «ya hecho» buscaba
  cualquier OTRA fila con la misma clave. El trigger es `after insert` por
  fila, y en un insert de varias filas a la vez (los ejercicios sin internet
  suben juntos) cada fila ya ve a las demás: dos filas del mismo ejercicio
  se veían una a la otra y ninguna pagaba. Ahora solo cuenta lo que vino
  ANTES, `(created_at, id) < (new.created_at, new.id)`: la primera paga.
- **Comprobado en la base** con un alumno real, dentro de un bloque que
  termina en `raise exception` (todo se deshace): un 4×4 Gran Maestro nuevo
  da 6; el mismo otra vez, 0; uno que ya había resuelto antes del cambio, 0;
  uno Fácil nuevo, 1; dos filas iguales en un solo insert, 1; `finales100`
  fallido, 0, y logrado después, 5. Mirar «ya hecho» en el alumno con más
  filas tarda unos milisegundos.

## Terminar un tema: el doble, hasta 500

Pedido por el dueño del sitio el 24/10/2026: «cuando se termine un tema, dé
el doble por premio por completarlo». Él mismo eligió el tope de 500 y que la
base compruebe que cada ejercicio exista de verdad en el tema. Lo hacen
`20261024200705_premio_temas.sql` y `20261024200854_premio_temas_cargar.sql`.

- **Qué es un tema**: lo mismo que ya usan las tareas (`metas.json`): los 80
  temas de Ejercicios por tema (también la «Mezcla equilibrada»), Mate en 1,
  2 y 3, los seis niveles del 4×4, los Tipos, las categorías de Aprender y de
  Practicar, y cada apertura de Aperturas y celadas con sus líneas. Un «tema»
  de un solo ejercicio no cuenta. Las fichas de Estudio no escriben en
  `training_progress`, así que no entran.
- **Sus ejercicios, en la base**: `interno.premio_temas` (el total) e
  `interno.premio_tema_items` (cada ejercicio). Los arma
  `herramientas/premio-temas.py` en `entreno/data/premio-temas.json`, de las
  mismas fuentes que `metas.json`. Son unos 160 KB: no caben en una migración
  (habría que pasarlos enteros por la herramienta), así que la base se baja el
  archivo publicado con pg_net y lo carga. Al cambiar el archivo, una vez
  publicado, en el editor SQL:

  ```sql
  select interno.premio_temas_pedir('https://ajedrez-integral.com/entreno/data/premio-temas.json');
  -- unos segundos después, con el número que devolvió:
  select interno.premio_temas_cargar_respuesta(<número>);
  ```

  Solo agrega y pone al día los totales; no borra (un ejercicio que sale de
  un tema se quita a mano). Al restaurar la base desde las migraciones, estas
  dos líneas hacen falta otra vez: los datos no viven en ninguna migración.
- **Cuándo paga**: un trigger aparte, `premiar_tema_terminado`, `after insert`
  en `training_progress` (el que paga cada ejercicio no se tocó). Mira solo los
  temas que contienen el ejercicio recién anotado y cuenta los ejercicios
  distintos de ese tema que el alumno ya resolvió, **con cualquier tema
  abierto**: en Ejercicios por tema un mismo ejercicio está en varios temas y
  la página lo anota una sola vez, bajo el que estaba abierto. Contarlo solo
  bajo su tema (como cuentan las tareas) dejaría temas imposibles de terminar.
  Un intento fallido no cuenta (`entrenamiento_logrado()`).
- **Cuánto**: el doble de lo que valen hoy sus ejercicios
  (`entrenamiento_premio()`, la tabla de arriba), con un tope de 500. Mate en
  2 vale 1434 × 3 × 2 = 8604 y paga 500; Las reglas de Aprender (5 × 1 × 2)
  paga 10. No lo doblan los «puntos dobles»: el origen `tema` no está en la
  lista de `otorgar_puntos()`, y si lo estuviera el tope dejaría de serlo.
- **Una sola vez por alumno y tema**: la referencia `tema:<grupo>:<tema>` y el
  índice único de `puntos_ajustes`.
- **La trampa que queda**: un ejercicio inventado no cuenta (no está en la
  lista), pero las listas son públicas (`temas.json`, `mates.json`… las baja
  la página), así que alguien que sepa usar la consola puede anotarse los
  ejercicios de verdad sin resolverlos. La base no puede saber si se resolvió
  de verdad: lo dice el navegador. Pasa lo mismo con cada ejercicio desde
  siempre; el premio lo hace valer más (hasta 500). Para cerrarlo haría falta
  comprobar cada solución en el servidor, como la Edge Function `partida-fin`.
- **El aviso**: `js/entreno-progress.js`, después de anotar un ejercicio,
  pregunta `mis_temas_terminados()` y dice «🏆 ¡Terminaste el tema «…»!
  Ganaste N Puntos Ajedrez de premio.» (`role="status"`), una vez: recuerda
  en el aparato lo ya dicho, porque la hora del celular puede no ser la de la
  base.
- **Lo ya terminado antes**: el trigger solo mira ejercicios nuevos. Quien ya
  tenía un tema completo cobra el premio la próxima vez que anote un
  ejercicio de ese tema; si ya no le queda ninguno por hacer, no cobra.

**Comprobado en la base el 24/10/2026**, con alumnos reales dentro de bloques
que se deshacen solos (un `raise` al final): a uno que tenía 305 de los 306
de Mate en 1, anotarle un ejercicio inventado no le pagó nada; el de verdad
le pagó 500 una vez (306 × 1 × 2 = 612, tope 500), y repetir uno no volvió a
pagar. A otro que ya tenía Las reglas completas de antes, la siguiente
lección le pagó 10. Al cargar la lista por primera vez había unos 200 temas
ya completos de antes (22 alumnos con «Ataque al enroque corto», 20 con
«Cómo mueve cada pieza»…); esos cobran con su próximo ejercicio del tema.

`verificar-premio-temas.js`: que `premio-temas.json` sea lo que hoy dan las
fuentes, que cada tema tenga los mismos ejercicios que dice `metas.json`, que
el trigger conozca cada grupo y que cada página siga anotando el id que lee
`premio_item()`, y que el aviso salga una vez. Se rompió a propósito (un
ejercicio menos en el archivo, el aviso sin llamar) y saltó.

## Entrenamiento, con puntos retroactivos (a diferencia de las tareas)

`20261009005657_puntos_entrenamiento_retroactivo.sql` paga, una sola vez, los
ejercicios de `training_progress` que ya existían ANTES de que
`otorgar_puntos_de_entrenamiento()` empezara a correr: ese trigger es
`after insert`, así que nunca vio los renglones viejos. Es lo opuesto de lo
que se decidió para las tareas (ver «Qué fuentes de puntos se decidió
cubrir» arriba: ahí pagar de golpe lo viejo se dejó fuera a propósito, «sería
una sorpresa, no un premio»): para entrenamiento el dueño del sitio pidió
justo eso, así que aquí sí se paga.

- Mismo tope de 40 puntos por día de Costa Rica que la regla en vivo, pero
  calculado día por día con la fecha de CADA ejercicio, no con la fecha en
  que corrió la migración: hay alumnos con cientos de ejercicios en un solo
  día histórico (hasta 395), y sin el tope esa única ráfaga pagaría de un
  golpe muchas veces lo que cualquier día de verdad puede dar. Antes de
  aplicarla se simuló el resultado y se le preguntó al dueño del sitio si
  quería el tope o pagar todo tal cual; eligió el tope.
- Inserta directo en `puntos_ajustes` (no llama a `interno.otorgar_puntos()`)
  y con el `created_at` del ejercicio, no el de hoy: así no pasa por el
  multiplicador de «puntos dobles» vigente el día que corrió la migración
  (ese premio no existía cuando se jugaron estos ejercicios) y no se suma al
  tope de ejercicios de HOY de nadie.
- Usa la misma referencia que el trigger en vivo (`'entrenamiento:' || id`),
  así que es idempotente con él y con ella misma: volver a correrla no paga
  dos veces.
- Resultado al aplicarla (9/10/2026): 6.745 de 19.760 ejercicios sin crédito
  pagaron sus 2 puntos (el resto chocó con el tope), 13.490 puntos repartidos
  entre 107 alumnos.

**Sobre el punto de restauración sin coincidir** (sección «El robo de
puntos», abajo, encontró el mismo problema con otra migración más): al
aplicar esta, la huella de `supabase_migrations.schema_migrations` no
coincidía con la del repositorio porque `20261008173204_puntos_retos_marcador.sql`
y `20261008173205_puntos_regalos_bromas.sql` —las dos que, según «Retos,
marcador, regalos y bromas» más abajo, se corrieron a mano en el editor SQL
por los `drop` que colgaban `apply_migration`— nunca llegaron a anotarse en
`schema_migrations` (su efecto SÍ está aplicado: las tablas y funciones que
crean existen). Quedó pendiente agregar esos dos renglones con su texto
exacto; intentarlo de nuevo desde `apply_migration`/`execute_sql` también se
cuelga (`cancelled`), así que falta correrlo a mano en el editor SQL de
Supabase, como la primera vez.

**Esos dos renglones se anotaron también en el proyecto equivocado.** Al
pegarlos a mano, quedaron además en la **Base de Colegios**
(`prcfbzvshnusisczlpxl`). Se vio el 17/10: Colegios tenía 9 migraciones
anotadas y el repositorio 7, y su huella no coincidía. Ahí el SQL nunca
corrió, porque no había ninguna de sus tablas ni el esquema `interno`: solo
las dos filas de `schema_migrations`, con los `\r\n` de lo pegado desde
Windows. El dueño las borró en el editor SQL de Colegios, porque por
`execute_sql` un `delete` se cuelga igual que un `drop`. Colegios volvió a 7 y
a la huella del repositorio (`35dfa766…`). En la Academia las dos siguen
anotadas, y bien. **Antes de pegar algo en el editor SQL, mirar en la
dirección qué proyecto está abierto**: `bgtijpimpcokxatxxbki` es la Academia y
`prcfbzvshnusisczlpxl` es Colegios.

## El robo de puntos

Migración `20261009140000_robo_de_puntos_al_perder_la_ventaja.sql`. Cuando dos
alumnos juegan entre sí una partida de ajedrez estándar y quien termina
GANANDO estuvo en algún momento en una posición materialmente perdida, se le
roban esos puntos a quien tenía la ventaja y la dejó ir: la cantidad es la
mayor ventaja en material (en peones) que tuvo el perdedor en algún punto de
la partida, por 100 (+6 en algún momento = 600 puntos). Se le restan a quien
perdió habiendo ido ganando y se le suman a quien ganó: es un robo de
verdad, no un descuento que desaparece.

**Por qué material y no una evaluación de motor.** No hay ningún motor
corriendo durante una partida entre alumnos (a diferencia del bot de Oscar o
la práctica), y evaluar con Stockfish en el navegador de un jugador sería
manipulable: un alumno podría no evaluar, o falsear el resultado, justo para
evitar que se note su ventaja perdida. El material, en cambio, se puede
recalcular después de que la partida terminó, a partir de las jugadas que de
verdad se jugaron (`game_rooms.moves`, que ya guarda el servidor): nadie lo
puede inflar ni esconder. Es una medida más cruda que una evaluación
posicional (no ve ataques ni amenazas, solo piezas), pero es la que no se
puede hacer trampa, y es la que pidió el dueño del sitio con su propio
ejemplo («ventaja de +6» → 600 puntos).

**Por qué en una Edge Function y no en SQL.** Contar material jugada por
jugada exige reproducir la partida con reglas de ajedrez de verdad
(capturas, promociones, enroque...), y eso no se hace en SQL sin reinventar
un motor de reglas adentro de una función `plpgsql`. `supabase/functions/
partida-fin/calculo.ts` hace la cuenta con chess.js —la misma librería que
usa todo el sitio para no inventar nunca una posición (`verificar-tipos.js`,
los generadores de libros...)—, y es una función PURA (recibe un tablero de
chess.js ya armado, no importa nada de Supabase ni de Deno): la prueba
(`herramientas/verificar-puntos-robo.js`) la importa tal cual, sin copiarla,
así que nunca se prueba una reimplementación en vez del código que se
despliega.

**Solo variante "estandar".** En crazyhouse, niebla, cartas, duelo,
camaleón... el conteo de material a partir de las jugadas SAN con chess.js
no es confiable (hay descartes, piezas que cambian de valor, reglas
distintas): `disparar_fin_de_partida()` ni siquiera avisa a la Edge Function
si la variante no es la estándar, y la función lo vuelve a comprobar por si
acaso.

**Solo entre dos alumnos.** Si juega un profesor (el profe también se sienta
a jugar, ver `clase-en-vivo.md`) no hay robo: la Edge Function lee el `role`
de los dos perfiles y exige que ambos sean `'alumno'`. No hay bot en
`game_rooms` (el bot de Oscar no usa esta tabla), así que no hace falta
excluirlo aparte.

**Cómo se dispara, sin que el navegador tenga que avisar nada.** El trigger
`disparar_fin_de_partida()` (sobre `game_rooms`, cuando `status` pasa a
`finished`) avisa con `pg_net` a la Edge Function `partida-fin`, firmado con
el secreto de la bóveda `partida_robo_secreto` (mismo patrón que
`disparar_informes_encargados`/`alerta-base`: `verify_jwt` en false, nadie
más la puede llamar). La función vuelve a leer la sala por su cuenta antes de
reproducir nada — el aviso solo trae el `id` — así un aviso repetido o tardío
nunca cobra ni paga de más, y `registrar_robo_de_puntos()` además es
idempotente por sala (`partida_robo:<room_id>` / `partida_premio:<room_id>`
como referencia de `puntos_ajustes`, origen `'partida'`).

**Qué NO hace.** No distingue empates (nadie roba en unas tablas) ni castiga
por sí sola ganar "de pura suerte": si la posición nunca estuvo objetivamente
perdida para quien ganó, no se roba nada, aunque la partida haya sido reñida.
Tampoco se aplicó con retroactividad a partidas ya jugadas antes de esta
migración: solo las que terminan después de que el trigger existe.

## Los verificadores

`herramientas/verificar-puntos.js` (con Playwright y un doble de Supabase,
mismo estilo que `verificar-trofeos.js`): el saldo se pinta, un premio que no
alcanza se ve deshabilitado y dice cuánto falta, canjear descuenta y queda en
«Mis premios», el límite de una vez por alumno se respeta, equipar/quitar un
cosmético no toca el saldo, el aviso de «puntos dobles» aparece solo si está
vigente, un accesorio canjeado decora el avatar (`Puntos.decorarAvatar`,
sobre una caja recortada a círculo de verdad, como la real —no una caja
cualquiera: con eso se encontró que la insignia quedaba adentro de la caja
recortada, invisible— y SIN quedar recortada) y deja de aparecer en
`accesorios_de()` al quitárselo, y el bono de racha se
anuncia una vez y no se repite. También comprueba, en estático, que
`js/puntos.js` y `js/puntos-tienda-pagina.js` no usan `alert()`/`confirm()`/
`prompt()` y que `puntos-tienda.html` no tiene código escrito adentro fuera
de los tres bloques generados. Desde la segunda parte, también: lo
pendiente se anuncia una vez y no se repite, los retos con su avance escrito,
el marcador (semana y mes, uno mismo marcado), regalar y mandar bromas con
compañero y mensaje de la lista, el regalo recibido con su remitente, y los
ajustes de bromas.

`herramientas/verificar-bromas.js`: dónde se carga `js/bromas.js` (y dónde
no), el contraste de cada par del arcoíris, que cada broma dice quién la
mandó, que solo las de una vez se marcan vistas, que «menos movimiento» deja
el aviso sin mover nada, que el Modo Adaptado no pinta ninguna, que el
arcoíris le gana al color en línea del tablero y que el aviso de una broma de
una hora no se repite en cada página. Se rompió a propósito (el Modo
Adaptado, la animación, `bromas.js` en `examen.html`) y saltó en las tres.

`herramientas/verificar-puntos-robo.js` (sin navegador): el cálculo del robo
de puntos (`supabase/functions/partida-fin/calculo.ts`), importado tal cual
—no copiado— y corrido con el chess.js del sitio sobre una partida real (la
trampa de Légal: blancas pierden la dama y aun así dan mate, 8 de ventaja
perdida = 800 puntos), mirado desde el ganador y desde el perdedor, una
partida sin capturas (no roba nada) y una jugada que no calza (corta en seco,
no revienta). Lo que NO comprueba: que el trigger `disparar_fin_de_partida`
solo avisa para la variante estándar y con un ganador de verdad, y que
`registrar_robo_de_puntos()` no paga ni cobra dos veces la misma sala — eso
se apoya en el mismo patrón ya probado de `otorgar_puntos()` y en la
comprobación hecha a mano en la base al aplicar la migración (ver abajo),
no en una prueba de Playwright.

Lo que NO comprueba el verificador de Playwright: que
`interno.otorgar_puntos()` no pague dos veces el mismo evento, que
`canjear_premio()` rechace sin saldo con el candado puesto, y que las
políticas de `puntos_ajustes`/`premios_canjeados` solo dejen ver lo propio,
lo de los alumnos de un profesor, lo de quien supervisa y lo de quien
administra. Eso se apoya en que `canjear_premio()`/`otorgar_puntos()` siguen,
renglón por renglón, el mismo candado (`pg_advisory_xact_lock`) y la misma
forma de política que `ajustar_trofeos()`/`trofeos_ajustes` —ya probadas
impersonando roles contra el proyecto cuando se escribieron—, no una
impersonación nueva hecha para esta función. **Queda pendiente** hacer esa
prueba de verdad (dos canjes a la vez desde dos sesiones, un alumno pidiendo
el saldo de otro) antes de confiar en esto tanto como en lo de trofeos.

**Lo que sí se comprobó impersonando roles (8/10/2026, con la segunda parte
ya aplicada, solo lecturas o llamadas que fallan antes de escribir):**

- Como alumno: no ve ni un renglón ajeno de `puntos_ajustes`, ni bromas ni
  preferencias de otros. El marcador solo trae a compañeros (cada fila pasa
  `es_companero()`), y uno de otra academia no aparece. La lista de
  `profiles` que ofrece «Regalar…» son todos compañeros de verdad.
  `es_companero()` da `true` con uno de su mismo profe y academia, y `false`
  con uno del mismo profe pero de otra academia.
- `regalar_premio()` a alguien de otra academia: «Solo se le puede regalar a
  un compañero de clase.». `mandar_broma()` con un globo de texto inventado:
  «Elige una frase de la lista.».
- Como profe: el marcador solo trae a sus alumnos. Sin sesión (`anon`):
  «permission denied» para `marcador_del_salon`.

Sigue pendiente lo que exige escribir: dos canjes a la vez desde dos
sesiones, y los topes del día de regalos y bromas.
