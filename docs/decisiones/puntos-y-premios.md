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
  fecha), se suman `puntos_de_la_clase()` + `puntos_de_tandas()` de esa
  clase, por alumno. **No** se incluyen los turnos de palabra, las prácticas
  ni las partidas de `js/puntos-clase.js` (`REGLAS`): esos números viven solo
  en `game_state` (podio, equipos), que se limpia al cerrar la clase — para
  sumarlos de forma confiable haría falta guardarlos en una tabla aparte
  antes de la limpieza, que es un cambio más grande y se deja para otra vez.
- **Entrenamiento**: 2 puntos por cada fila nueva de `training_progress`
  (cualquier actividad), con un tope de 40 por día de Costa Rica — sin tope,
  bastaría con repetir un ejercicio trivial en bucle para juntar puntos sin
  aprender nada.
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
  insignia encima de la caja que arma `FotoPerfil.avatar()`/`poner()`: la
  caja necesita `position: relative`, que la función agrega sola.
- `Puntos.accesoriosDe(sb, ids)` tiene memoria de página con un vencimiento
  de 60 segundos (no sin vencer: un alumno se puede quitar el accesorio a
  mitad de clase desde la tienda, en otra pestaña, y la lista del profesor no
  debería quedar mostrando uno que ya no está puesto).
- La decoración se pide DESPUÉS de pintar la lista entera (no antes): así un
  accesorio que tarda en llegar no atrasa nada más, y como la lista se
  vuelve a pintar con cada latido de presencia, lo peor que pasa es que se
  vea un instante más tarde.

Queda para otra vez: que los propios compañeros (no solo el profesor) se
vean los accesorios entre ellos en algún listado de alumno a alumno, y que
un accesorio se vea también en el modo proyector.

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
- topes por día: una por pareja, 5 de quien manda, 3 de quien recibe.

Y las de la página: `js/bromas.js` solo se carga en el panel, la tienda y
Entrenamiento (`herramientas/academia-cabecera.py`), nunca en un examen, la
clase en vivo, un torneo ni el diagnóstico; con Modo Adaptado o el panel para
quien no ve no se pinta nada; con «menos movimiento» queda el aviso y nada se
mueve. Los colores del arcoíris están medidos: cada par tiene la misma
luminancia que el tablero de siempre, así que el contraste entre casillas y
con las piezas no cambia, solo el tono. La animación le gana al estilo en
línea que `board-color-themes.js` pone sobre `<html>`.

## Los verificadores

`herramientas/verificar-puntos.js` (con Playwright y un doble de Supabase,
mismo estilo que `verificar-trofeos.js`): el saldo se pinta, un premio que no
alcanza se ve deshabilitado y dice cuánto falta, canjear descuenta y queda en
«Mis premios», el límite de una vez por alumno se respeta, equipar/quitar un
cosmético no toca el saldo, el aviso de «puntos dobles» aparece solo si está
vigente, un accesorio canjeado decora el avatar (`Puntos.decorarAvatar`) y
deja de aparecer en `accesorios_de()` al quitárselo, y el bono de racha se
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
