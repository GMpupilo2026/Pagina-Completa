# Cobros, acceso y tienda

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: mensualidades, paquetes de acceso y la tienda de materiales.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

## Cobros: lo que se guarda es lo que pasó, no el estado

`cobros.html` son las mensualidades de la Academia: planes, quién paga qué,
cobros emitidos, pagos y morosidad. Es **una página para dos públicos**, como
`informes.html`: quien coordina o administra lo maneja todo; cualquier otra
cuenta ve **solo sus propios recibos**, de lectura.

**No es una función de profesor, a propósito.** Todo pasa por
`soy_coordinador()` (`es_coordinador or is_admin`): un profesor cualquiera no
tiene por qué ver cuánto paga cada alumno. Está comprobado impersonando roles
en SQL — un profesor sin coordinación recibe **cero filas** de `cobros_vista` y
de `planes_cobro`; el alumno recibe la suya y ninguna más.

**Y un coordinador tampoco ve los cobros de otro.** El alcance no es "coordina
o no" sino `bajo_mi_coordinacion(student_id)` (ver «Coordinar es un alcance,
no una llave maestra»), sobre `cobros`, `pagos`, `suscripciones`,
`cobros_contacto`, `avisos_cobro`, `datos_facturacion` y
`cobros_recordatorios_programados` — las siete tablas de esta página que
tienen alumno. Re-comprobado impersonando a dos coordinadoras reales de la
Academia: una con alumnos vinculados ve sus cobros, pagos y suscripciones; la
otra, sin ningún profesor vinculado todavía, recibe **cero filas** de las
siete, y `cobros_resumen()`/`cobros_morosos()` (que son `SECURITY INVOKER`
sobre `cobros_vista`, una vista con `security_invoker = on`) le dan **cero**
también — no hay ningún camino que las junte.

**Los `planes_cobro` también son privados por coordinador, y esto se
revirtió.** Nacieron compartidos —eran las tarifas de la Academia, sin alumno
al que atarlos— pero eso significaba que una coordinadora veía y podía tocar
el catálogo entero de las demás: "Mensualidad SJ" y "Mensualidad Cenfo"
mezclados en el mismo selector, con el desactivar de una alcanzando al plan de
otra. La migración `planes_cobro_personalizado_y_privados` cambió
`planes_lee_coordinacion`/`planes_escribe_coordinacion` de `soy_coordinador()`
a secas a `bajo_mi_coordinacion(creado_por)`, el mismo patrón que el resto de
esta página. Cada coordinadora arma y ve solo sus propios planes; quien
administra, como siempre, todos.

- **`cobros.estado` solo vale `emitido` o `anulado`.** "Pagado" y "vencido" NO
  se guardan: los calcula `public.cobros_vista` a partir de lo único que se
  escribe — que se emitió un cobro y que entró un pago. Si "pagado" fuera una
  columna habría que mantenerla al día con un trigger y podría contradecir a la
  suma de los pagos, que es exactamente el fallo callado que ya tuvimos con el
  contador de invitaciones. **La página tampoco recalcula: pinta la `situacion`
  que viene de la base.**
- Se aceptan **pagos parciales**: `pagos` es una fila por abono y el saldo es la
  resta. Un cobro queda pagado cuando la suma alcanza, sin que nadie lo marque.
- **`generar_cobros()` se puede correr todas las veces que se quiera.** El
  índice único `(suscripcion_id, periodo_inicio)` es lo que impide duplicar:
  la segunda corrida devuelve 0. Comprobado, y también que al mes siguiente
  emite exactamente uno más.
- El periodo arranca en el **mes** de `inicio`, no el día: la mensualidad de
  quien entra el 20 cubre ese mes completo. Para cobrarle solo los días que quedan,
  o nada hasta una fecha que ya pagó, está `pagado_hasta` (ver «De qué día a
  qué día cubre un cobro»).
- `cobros_resumen()` devuelve **una fila por moneda**: sumar colones con dólares
  daría un número que no significa nada.
- Las tres funciones de cuenta son **`SECURITY INVOKER`**, igual que las de
  informes: quién ve qué lo sigue decidiendo la RLS de cada tabla.

### Los avisos de morosidad

Mismo circuito que los informes a la casa: `pg_cron` → `pg_net` → Edge Function
`cobros-recordatorios` → Resend, desde el dominio verificado. Dos tareas
diarias: `cobros-generar` a las 11:30 UTC (5:30 de la mañana en Costa Rica) y
`cobros-recordatorios` a las 12:30 — los cobros quedan emitidos **antes** de que
salgan los avisos.

- Tres avisos: **días antes** de vencer, **días de atraso** para "vencido" y
  **días de atraso** para "moroso" — de fábrica 3, 1 y 15, pero **configurables
  para toda la Academia** (ver «Cuándo salen los tres avisos automáticos» más
  abajo). Van a los encargados apuntados en Informes y a la propia cuenta del
  alumno.
- **«Vista previa» y «Recordar ahora» exigen `soy_coordinador()`.** Solo con
  la RLS de `cobros_vista`, un alumno —que ve sus propios cobros— leía los
  correos de sus encargados y podía mandarle a su familia avisos de morosidad
  cuantas veces quisiera. Y `disparar_recordatorios_programados()` ya no la
  puede llamar ninguna cuenta con sesión: es del cron, que corre como
  `postgres`.
- **Un correo por alumno, no uno por cobro**: a nadie le sirve recibir tres el
  mismo día. Se manda el estado de cuenta entero con el tono del aviso más
  urgente que tenga.
- **Cada aviso se manda una sola vez**, y lo garantiza el índice único de
  `avisos_cobro (cobro_id, tipo, correo)`, no un `if` en el código. La fila se
  apunta **después** de que Resend acepte: si falla, mañana se reintenta en vez
  de darlo por mandado. Comprobado de punta a punta contra `delivered@resend.dev`
  — la primera corrida mandó 2 y la segunda saltó 2.
- La tanda va firmada con su propio secreto del Vault (`tanda_cobros_secreto`,
  generado por la migración y nunca escrito en ninguna parte). Comprobado: con
  una firma inventada responde 401.
- **El tono no amenaza.** Ni el aviso de los 15 días habla de sacar a nadie de
  clase: dice que se hable. Quien lee puede ser una familia a la que se le
  complicó el mes.

### Cuándo salen los tres avisos automáticos

Los tres días —antes de vencer, de atraso para "vencido", de atraso para
"moroso"— estaban escritos como constantes dentro de
`supabase/functions/cobros-recordatorios/index.ts`
(`DIAS_ANTES_DE_VENCER`, `DIAS_VENCIDO`, `DIAS_PARA_MOROSO`): cambiarlos era
editar la función y volver a desplegarla. Ahora se editan desde la ficha
«Morosidad» de `cobros.html`, en «⏱️ Cuándo salen los tres avisos automáticos».

- **Valen para TODA la Academia, no por alumno ni por coordinador.** Es un
  ajuste de cuándo se manda cada tipo de aviso, no de a quién — la misma
  decisión que ya tomó `whatsapp_consultas`, guardado en la misma tabla
  clave/valor `ajustes_academia` (claves `cobros_dias_antes`,
  `cobros_dias_vencido`, `cobros_dias_moroso`).
- **Si el ajuste no existe o trae algo raro, se usa el de siempre y la tanda
  sigue.** `parametrosAvisos()` lee las tres claves con `try/catch` y valida
  cada una (`diasAntes >= 0`, `diasVencido >= 1`, `diasMoroso > diasVencido`);
  lo que no pase la prueba cae al valor por omisión (3 / 1 / 15). Un ajuste mal
  guardado nunca rompe la corrida diaria — como mucho, no cambia nada.
- **La página valida lo mismo antes de guardar**, con el mismo criterio: sin
  eso, un "moroso" antes que "vencido" dejaría cobros marcados vencidos
  saltando derecho a "moroso" sin pasar por el aviso del medio, y la tanda lo
  aceptaría igual porque `parametrosAvisos()` también lo rechazaría — solo que
  en silencio, cayendo al valor de siempre sin decir por qué el ajuste guardado
  "no sirvió".
- **`ajustes_academia` ya tenía RLS para que cualquiera con sesión lea y
  `soy_coordinador()` escriba** (es la misma tabla del número de WhatsApp), así
  que no hizo falta ninguna política nueva.

### Qué dice el correo de cobro

El asunto y el párrafo de entrada de cada uno de los tres avisos (próximo,
vencido, moroso) y el «Cómo pagar» estaban escritos dentro de
`supabase/functions/cobros-recordatorios/aviso-html.ts`: cambiar una palabra
era editar la función y volver a desplegarla. Ahora se editan desde la ficha
«Morosidad» de `cobros.html`, en «✉️ Qué dice el correo».

- **Mismo lugar y mismo alcance que los días**: `ajustes_academia`, para toda
  la Academia, claves `cobros_asunto_<tipo>`, `cobros_mensaje_<tipo>` y
  `cobros_como_pagar`. La escribe `soy_coordinador()` con la RLS que ya tenía
  la tabla. El tope de la tabla subió de 300 a 1000 caracteres
  (`ajustes_academia_textos_cobro`): 300 alcanzaba para un número de WhatsApp,
  no para un párrafo con la cuenta bancaria.
- **En blanco quiere decir «el de fábrica».** La página guarda `null` y
  `textosCorreo()` / `elegido()` caen al texto de fábrica; igual con lo que no
  se pueda leer: un ajuste nunca cuesta la tanda. Los textos de fábrica están
  escritos con las mismas marcas `{alumno}` y `{academia}` que usa quien edita,
  así pasan los dos por el mismo camino.
- **Lo que se escribe es texto, no HTML**: se escapa entero y después se pone
  el nombre en negrita y los saltos de línea como `<br>`. Los reemplazos van
  con función (`replaceAll(x, () => …)`): con texto, un nombre con `$&`
  adentro se tomaría como patrón. El asunto sale en una sola línea.
- **Lo que no se deja editar** es lo que tiene que ser cierto siempre: el
  saludo, la tabla de lo que se debe, el total y a dónde mandar el comprobante
  (sale del WhatsApp de «Contacto» y se agrega solo después del «Cómo pagar»).
- **La vista previa la arma la misma función que manda el correo** (acción
  `muestra`, que exige `coordinador_puede('cobros')`), con los textos todavía
  sin guardar y un cobro de ejemplo. Los textos de fábrica que se ven de guía
  dentro de cada casilla también vienen de ahí: copiados en la página, se
  separarían del correo a la primera corrección.

**Al tocar esto, correr `node herramientas/verificar-aviso-cobro.js`** (sin
navegador: el HTML del correo con textos propios, en blanco y con nombres
raros) **y `verificar-cobros.js`** (qué manda la ficha al guardar y al pedir la
vista previa).

### Un recordatorio para un día y una hora exactos

Los tres avisos de arriba salen solos, en la hora que decide el cron. Pero
"que le llegue el lunes a las 8, después de hablar con la mamá" no es ninguno
de los tres, así que en la ficha «Morosidad» de `cobros.html` hay un
**«📅 Programar un recordatorio»**: se elige el alumno, el día y la hora, y
opcionalmente a qué correos (si se dejan en blanco, los mismos destinos de
siempre — el fijado a mano, si hay; si no sus encargados; si no, su cuenta).

- **Es una fila, no una llamada.** `public.cobros_recordatorios_programados`
  (alumno, cuándo, estado, correos opcionales, nota) se escribe **directo
  desde el navegador** con `sb.from(...).insert(...)`: su RLS ya exige
  `soy_coordinador() and bajo_mi_coordinacion(student_id)` para las cuatro
  operaciones, así que no hace falta una Edge Function solo para guardar el
  dato — la misma razón por la que `anularCobro()` escribe directo
  (`registrarPago()` ya no: ver «Recibos por academia»). Cancelar es la misma fila con `estado: 'cancelado'`.
- **Mandarlo sí necesita la service role**, porque el correo tiene que salir
  aunque quien lo programó no tenga la pestaña abierta esa hora: eso es
  `"tanda_programados"`, una acción más de la Edge Function
  `cobros-recordatorios` (las otras: `vista_previa`, `recordar_ahora`,
  `tanda`). Un `pg_cron` corre cada 5 minutos —bastante seguido para que "a
  las 3pm" salga cerca de las 3pm— y solo llama a la función si hay algo
  `pendiente` con `programado_para <= now()`; la mayoría de las corridas no
  cuestan ni una llamada HTTP. Va firmada con el mismo secreto que `tanda`
  (`tanda_cobros_secreto`).
- **El tipo de aviso (próximo/vencido/moroso) se calcula a esa hora, no al
  programarlo.** Entre que se programa y que llega su momento pueden pasar
  días: un cobro que era "vencido" puede haberse pagado. Por eso
  `tanda_programados` vuelve a mirar los cobros pendientes del alumno en el
  momento de mandar, exactamente como hace `recordar_ahora`.
- **Si para esa hora ya no hay nada pendiente, o no hay a quién avisarle, NO
  se manda ningún correo — pero la fila igual se marca `enviado`, con la
  razón en `nota`.** Dejarla en `pendiente` para siempre la haría reintentar
  cada 5 minutos sin sentido; y contarla como "falló" sería mentir, porque no
  falló nada: ya no hacía falta. `nota` es justo lo que evita que "enviado"
  mienta en silencio — dice a quién se le mandó, o por qué no se mandó nada.
- **El `avisos_cobro` de siempre se sigue respetando.** Si el mismo cobro ya
  recibió su aviso ese día por la tanda diaria o por "Recordar ahora", el
  `upsert` con `onConflict: cobro_id,tipo,correo` no lo duplica.
- **`anon` tenía permiso de tabla sobre esta, y las tablas hermanas no.**
  `cobros`, `pagos`, `suscripciones`, `cobros_contacto`, `avisos_cobro` y
  `datos_facturacion` ya le tenían revocado el `select/insert/update/delete` a
  `anon` desde que se crearon; esta se quedó con lo que Supabase le da por
  omisión a toda tabla nueva, porque nació sin ese paso. La RLS ya la paraba
  igual —`anon` no tiene `auth.uid()`, así que `bajo_mi_coordinacion()` le da
  `false` siempre— pero es la misma decisión que en `formularios` y
  `profile_teachers`: una puerta menos que dependa de que la política esté
  bien escrita. Se revocó (`revoke all ... from anon`).

**Al tocar esto, correr `node herramientas/verificar-cobros.js`** (con el
sitio en localhost:8777 y playwright). Comprueba qué manda el formulario al
programar (el alumno, el momento en ISO y los correos sueltos), que un correo
mal escrito no llegue a mandarse, que cancelar filtre por el id de ESE
recordatorio y no de otro, y que la lista pinte el nombre del alumno y su
estado. Lo que hace la Edge Function con la service role —recalcular el tipo,
no mandar nada si ya no hace falta, dejar la nota— se comprobó leyendo el
código y contra la base, como el resto de las tandas firmadas de este
archivo.

### Un cobro personalizado, sin pasar por el catálogo

"Poner a un alumno en un plan" solo dejaba elegir de la lista de
`planes_cobro`, y el caso de todos los días —una beca a la medida, un acuerdo
puntual con una familia— obligaba a crear un plan del catálogo solo para ese
alumno, y ese plan se quedaba ahí para siempre ofreciéndosele a cualquiera.

La casilla **"Cobro personalizado"** de esa misma ficha destapa tres campos
—concepto, monto y moneda— en vez del selector de plan. Al guardar:

- **Se crea un `planes_cobro` normal, marcado `personalizado = true`, y la
  suscripción apunta a ese plan nuevo.** No hay ninguna tubería aparte:
  `generar_cobros()` y `cobros_resumen()` no distinguen entre un plan del
  catálogo y uno personalizado — son la misma fila con la misma forma, así que
  reusan exactamente el mismo camino que ya emitía y cobraba mensualidades.
- **La periodicidad queda fija en "mensual"** y no se pregunta: un cobro
  personalizado es casi siempre "esto en vez de la mensualidad de siempre", y
  un campo más que llenar es un campo que se puede llenar mal.
- **No sale ni en la pestaña «Planes» ni en el selector de plan de esta misma
  ficha.** `pintarPlanes()` y el `<select id="s-plan">` filtran
  `!p.personalizado`: es un plan de un alumno, no catálogo de nadie más, y
  ofrecerlo ahí sería mezclar "las tarifas de la Academia" con un acuerdo de
  una sola familia. El arreglo `planes` completo (con los personalizados
  adentro) se sigue usando para resolver el nombre y el monto de cada
  suscripción — lo que se filtra es dónde se OFRECE, no lo que existe.
- **Es privado, como cualquier otro plan desde el cambio de arriba.** Se crea
  con `creado_por: session.user.id`, así que `bajo_mi_coordinacion(creado_por)`
  ya lo deja visible solo para quien lo armó (y para quien administra).

**Al tocar esto, correr `node herramientas/verificar-cobros.js`** (mismo
verificador de arriba). Comprueba que un plan `personalizado` no aparezca en
«Planes» ni en el selector, que marcar la casilla esconda el selector y
muestre los tres campos, que guardar cree el plan con `personalizado: true` y
que la suscripción use el `id` de ESE plan recién creado (no el de otro plan
cualquiera — el fallo callado sería reusar sin querer un plan ajeno), y que
sin concepto no se cree nada.

### Los correos de una familia se corrigen en un solo lugar

Son TRES cosas distintas, y hasta ahora se tocaban en tres pantallas o en
ninguna:

| qué | dónde vive | quién podía tocarlo antes |
|---|---|---|
| con qué entra el alumno | `profiles.email` + `auth.users.email` | nadie desde el navegador |
| a dónde va el informe de la casa | `encargados` | solo un profesor SUYO |
| a dónde va el cobro | `cobros_contacto` (nuevo) | no existía |

La pregunta de quien está corrigiendo es UNA —«¿a dónde le estamos escribiendo
a esta familia?»—, así que los tres se manejan juntos, en la ficha «✉️
Contacto» de `cobros.html`, y los escribe la Edge Function **`correos-alumno`**.

- **Por qué hace falta una función y no alcanza con la RLS**, que es lo que hay
  que entender antes de tocarlo: `profiles.email` lo revierte el trigger
  `protect_profiles_identity_columns` —el correo es la llave con la que se
  inicia sesión— y además hay que cambiarlo en `auth.users`, que desde el
  navegador no se toca; `encargados` pide `soy_profesor_de()`, así que quien
  coordina sin ser profesor de ese alumno no podía corregir ni una letra.
- **Cuidado con el trigger, que es el fallo callado de siempre**: solo revierte
  cuando `auth.uid()` no es nulo. Escribir con la service role funciona;
  hacerlo con el cliente que lleva el JWT "funciona" también —y el valor queda
  como estaba, sin dar ningún error—. Por eso la función **vuelve a leer la
  fila** y falla si el correo no quedó, como ya hacía `marcar_coordinador()`.
- **Quién puede**: `soy_coordinador()` primero, y después la fila del alumno se
  lee con el JWT de quien llama. Si la RLS de `profiles` no se la devuelve, ese
  alumno no es suyo. La misma regla de `reenviar-acceso`, escrita una sola vez.
- **Un correo que ya es de otra cuenta se rechaza con un 409 que dice qué
  hacer**, en vez de pisarla: si son hermanos, la salida es «No tiene correo
  propio», que le arma un usuario de la Academia.
- **Pasar a «No tiene correo propio» exige un encargado activo**, y solo eso.
  Se miraba también `correo_de_contacto()`, que devuelve el correo que la
  cuenta tiene AHORA —justo el que se le está quitando—, así que la
  comprobación pasaba siempre y la cuenta podía quedar muda.
- **Corregir el correo de quien ya estaba apuntado es un UPDATE sobre su fila,
  no un alta.** De otra forma quedarían los dos —el bueno y el que tenía la
  letra mal— y a ese le seguirían saliendo los informes.

#### `cobros_contacto`: el correo del cobro, cuando hay que decirlo a mano

`correo_cobro()` miraba los encargados y, si no había, la cuenta del alumno.
Los dos son datos de OTRA cosa, así que corregir a dónde va el recibo obligaba
a cambiar algo que no era — y el caso de todos los días es tan tonto como una
letra mal escrita en el correo de la mamá, o un papá que paga pero no recibe
el informe.

- Una fila ahí **manda sobre todo lo demás y es la ÚNICA dirección** a la que
  se le avisa de ese cobro. No se suma a los encargados: si se sumara,
  corregir un correo equivocado seguiría mandándole el aviso al equivocado.
- **No acepta un usuario interno.** Ese dominio no tiene MX a propósito, así
  que fijarlo ahí sería mandar los avisos a un buzón que no existe: Resend
  acepta el envío, el correo rebota y no falla nada.
- El alumno **lee el suyo y no lo escribe**: tiene que poder ver a qué correo
  le llegan los avisos, pero si pudiera cambiarlo bastaría con eso para dejar
  de recibirlos.
- Comprobado impersonando roles en SQL: el correo se guarda en minúscula y sin
  espacios, manda sobre el encargado, el usuario interno se rechaza, y los
  intentos del alumno de editarlo o borrarlo cambian **0 filas**.

### El teléfono de las familias ya no está escrito en el código

El número al que la casa escribe salía a mano en **cuatro archivos** —el
informe de la casa, el informe de un examen, el aviso de cobro y «Mis pagos»—,
así que cambiarlo era una tanda de ediciones y un despliegue, y quien coordina
la Academia —que es justamente quien atiende esas consultas— no tenía forma de
tocarlo.

Ahora vive en **`public.ajustes_academia`** (clave/valor, clave
`whatsapp_consultas`) y se cambia desde la ficha «✉️ Contacto» de `cobros.html`.

- **Es clave/valor y no una columna por cosa** a propósito: lo que venga
  después (una dirección, un horario de atención) entra sin migrar la tabla.
- **Lo lee cualquiera con sesión** —es lo que la página le enseña al alumno
  cuando le dice a dónde escribir— y lo escribe `soy_coordinador()`.
  Comprobado: un alumno lee 1 fila y sus updates cambian **0**.
- **Si no hay número, no se inventa ninguno**: los correos salen pidiendo que
  respondan ese mismo correo. Un correo sin número al que escribir es peor que
  uno con el número de siempre, pero MUCHO mejor que uno con un número que ya
  no atiende nadie. Por eso tampoco hay un valor de respaldo escrito en el
  código: la fila se sembró con el número que había.
- **`wa.me` quiere los dígitos CON código de país.** Sin él, el enlace abre un
  chat con un número que no existe y eso se ve como un enlace perfecto: un
  número de ocho dígitos es de Costa Rica y se le pone el 506 delante. La regla
  está en `_compartido/contacto-academia.ts` y, a la fuerza, otra vez en
  `cobros.html` — son dos tiempos de ejecución que no pueden leerse entre sí.
- Las páginas **públicas** (la portada, `sobre-oscar.html`, el pie del sitio)
  siguen con el número escrito: son HTML estático que tiene que poder
  indexarse y leerse sin JavaScript, y ahí el número es el de la Academia de
  siempre. Lo que se movió es lo que sale POR CORREO.

**Esto pide desplegar cuatro Edge Functions**, ya desplegadas desde esta tanda:
`correos-alumno` (nueva), `cobros-recordatorios` (que además ahora respeta el
correo fijado a mano), `informes-encargados` e `informe-examen`. Se arman con
`node herramientas/funciones-armar.js`. `cobros-recordatorios` **entró al
repositorio en esta tanda**: antes vivía solo desplegada, así que cambiarle una
línea era bajarla, editarla a ciegas y volver a subirla.

### «Vence el día» va del 1 al 31

La base solo aceptaba del 1 al 28, para que todo mes tuviera ese día, pero la
página no lo decía (el `max="28"` del campo no frena el botón): quien quería
cobrar a fin de mes escribía 30 y le volvía «violates check constraint
suscripciones_dia_cobro_check», en inglés. Ahora la restricción es 1–31 y
`generar_cobros()` recorta el vencimiento al último día del mes
(`least(periodo_inicio + dia - 1, fin de ese mes)`): un 31 vence el 30 de abril
y el 28 (o 29) de febrero. La página revisa el número antes de mandarlo y lo
dice en español (`verificar-cobros.js`).

### Poner a muchos en un plan, cambiarlos en grupo y borrar un plan

**La asignación va con casillas.** «Quién paga qué» ya no tiene un selector
de un alumno: trae la lista de todos, con buscador, filtro por grupo, «Solo
los que no tienen ningún plan» y «Marcar los que se ven». Los filtros solo
deciden qué se VE: lo marcado sigue marcado aunque se esconda, y el contador
dice cuántos van. Se agregan todos en UN insert. Quien ya está activo en ese
plan se saca de la tanda antes de mandarla, porque el índice único
`suscripciones_una_activa_por_plan` rechazaría la tanda entera por uno solo, y
el aviso dice cuántos se dejaron igual. Con cobro personalizado y varios
marcados, **cada uno lleva su propio plan**: así se le puede cambiar el monto
a uno sin tocar a los demás.

**Cambios en grupo.** La lista de abajo tiene una casilla por suscripción,
buscador, filtro por plan y «Marcar todos los que se ven». Con lo marcado se
cambia la beca o el día de vencimiento (un `update … in (ids)`) o se da de
baja. La baja manda en UNA llamada a los que terminan hoy y, aparte, a cada
uno que todavía no arranca con su propia fecha de fin (`fin >= inicio`). Todo
vale de acá en adelante: lo ya emitido no cambia.

**Editar un plan** cambia nombre, monto y detalle; la periodicidad y la
moneda no, porque los cobros emitidos las llevan (para cambiarlas se crea
otro plan). El monto nuevo lo toma `generar_cobros()` en los cobros que salgan
después.

**Borrar un plan** lo hace `eliminar_plan_cobro(plan, anular_sin_pagos)`, en
la base y de una vez: `suscripciones.plan_id` es `ON DELETE RESTRICT`, y la RLS
de suscripciones solo deja tocar las de la propia coordinación, así que
borrarlo desde la página habría dejado cosas a medias. La función pide el
mismo permiso que escribir planes, y se niega entera si en el plan hay
alumnos de otra coordinación. Saca a todos del plan y borra el plan. **Los
cobros ya emitidos no se borran**: son el recibo, con su consecutivo y sus
pagos, y se quedan con `suscripcion_id` en NULL (`ON DELETE SET NULL`). Si se
elige, los que no tienen ningún pago se **anulan** con el motivo «Se borró el
plan…»; no se borran, porque el consecutivo ya se usó. Se comprobó
impersonando roles: una alumna y una llamada sin sesión reciben «Solo quien
coordina…», `anon` no tiene execute, y como administración borra el plan y
anula el cobro sin pagos.

### Recibos por academia: quien coordina registra, quien supervisa entrega

Cada pago queda en un **recibo** (`public.recibos`), con número propio de su
academia: `R-ADAPZ-2026-0001`. Se ve, se imprime o se guarda en PDF y se manda
a la familia desde la ficha «🧾 Recibos» de `cobros.html`. El alumno ve los
suyos en «Tus recibos».

- **Quien coordina registra; quien supervisa revisa y entrega.** Lo pidió el
  dueño: el recibo no sale a la familia hasta que el supervisor de la academia
  (o administración) lo revisa. Entregar es mandarlo por correo
  (`recibo_enviar` de la Edge Function `cobros-recordatorios`) o marcarlo
  «entregado en mano» (`recibo_entregado_en_mano()`), para el que se imprime.
  Mientras nadie lo entrega, sale en «Lo urgente» del supervisor y de
  administración («recibos de pago por revisar y entregar», `js/pendientes.js`)
  y la ficha dice cuántos faltan. La pregunta es **una**,
  `interno.corrijo_cobros_de(alumno)` (`is_admin`, o `es_supervisor` y
  `supervisado_por_mi()`), y la Edge Function la hace con el JWT de quien pide
  el envío (`puedo_corregir_cobros()`): la pantalla solo esconde los botones.
- **Quien supervisa corrige todo lo ya registrado**, y quien coordina nada de
  eso: el monto, la fecha y el método de un recibo (`corregir_recibo()`, que
  cambia también sus pagos; un monto en 0 quita esa línea), anularlo o
  reactivarlo (`anular_recibo()`), y el concepto, el monto o el vencimiento de
  un cobro, o reactivar uno anulado. Lo de los cobros es un `update` directo,
  pero el trigger `cobros_corrige_supervision` lo rechaza si no corrige quien
  llama; anular sigue siendo de quien coordina. Un pago borrado o cambiado en
  silencio es plata que desaparece, por eso la escritura de `pagos` (update y
  delete) quedó solo para quien corrige.
- **Un pago sin recibo no puede existir.** `pagos` ya no se inserta desde el
  navegador (se le quitó el permiso a `authenticated`): lo escriben
  `registrar_pago()`, `pago_adelantado()` y `registrar_cobro_pagado()`, que
  validan (que no se pague de más, una sola moneda y un solo alumno por recibo,
  la fecha no en el futuro) y dan el recibo en la misma transacción. Los 15
  pagos que ya había recibieron uno cada uno al aplicar la migración.
- **El número lo da un contador en la base** (`recibo_contadores`, por prefijo
  y año, con un upsert que bloquea la fila): un `max()+1` le daría el mismo
  número a dos pagos registrados al mismo tiempo. El prefijo es el de la
  academia (`academias.prefijo_recibo`, o la primera palabra del nombre: ADAPZ,
  CENFOTEC, CCDR); lo cambia su supervisor o administración, y los recibos que
  ya salieron conservan su número. Sin academia, `AI`. De qué academia es el
  recibo lo dice `interno.academia_para_recibo()`: la que tiene abierta quien
  supervisa varias, o la única del alumno.
- **Anular no borra.** Un recibo anulado se queda con su número (es el registro
  de lo que pasó) y sus pagos dejan de contar: `cobros_vista` suma solo los
  pagos de recibos no anulados, así que el cobro vuelve a quedar pendiente sin
  tocar nada más. Reactivarlo los vuelve a contar, y se rechaza si con eso un
  cobro quedaría pagado de más.
- **El total del recibo se calcula** (`recibos_vista`, la suma de sus pagos),
  no se guarda: corregir un monto lo cambia solo.
- **El recibo es UN HTML** (`cobros-recordatorios/recibo-html.ts`): el mismo
  para la vista previa, para imprimir y para el correo, con la marca de la
  academia DEL RECIBO. Dice que es un recibo interno y no una factura
  electrónica, y uno anulado lo dice con palabras arriba, porque impreso no hay
  colores. En la página va en un marco `sandbox="allow-same-origin
  allow-modals"`: sin `allow-scripts` no corre código, y los otros dos hacen
  falta para imprimirlo desde el botón.

#### Pagar por adelantado

«💵 Pago adelantado o sin cobro previo», en la misma ficha:

- **Adelantar N periodos de un plan** (`pago_adelantado()`): paga los periodos
  que siguen sin pagar, del más viejo al más nuevo (si debe algo, eso va
  primero), y emite los que todavía no salieron con `interno.emitir_cobros()`:
  **el mismo cuerpo que `generar_cobros()`**, acotado a esa suscripción, para
  que el concepto, la beca y el día de vencimiento salgan iguales que en la
  corrida diaria. El índice único `(suscripcion_id, periodo_inicio)` hace que la
  corrida de mañana no los vuelva a emitir, y como ya están pagados no generan
  avisos de cobro. Hasta 24 periodos y tres años; respeta el `fin` del plan.
- **Algo que no tenía cobro** (una inscripción, un torneo):
  `registrar_cobro_pagado()` emite el cobro y lo paga entero, con su recibo.

Comprobado en la base impersonando roles, en una transacción revertida, con
la supervisora real de ADAPZ y una alumna suya: adelantar 2 periodos de un
plan anual emitió los dos (octubre 2026 y 2027) y los dejó pagados con un
recibo de ₡40 000; pagar lo ya pagado y corregir un monto de más se rechazan;
corregir baja el total; anular deja los dos cobros pendientes y reactivar los
vuelve a contar; un pago sin cobro previo queda pagado; con el prefijo nuevo
la cuenta arranca en `R-ADZ-2026-0001`; el supervisor de OTRA academia ve 0
recibos de ADAPZ y no anula, no adelanta ni cambia el prefijo; la alumna ve
sus 3 recibos y ninguno ajeno, y no se paga ni toca la entrega; un profesor
cualquiera ve 0 recibos y 0 pagos; `anon` no tiene permiso ni sobre la tabla
ni sobre las funciones; y la corrida diaria, hasta 400 días adelante, no
vuelve a emitir lo adelantado (0 nuevos). **Pendiente**: la misma prueba con
una cuenta que SOLO coordina (no hay ninguna real; hay que marcar una dentro
de la transacción). Su caso lo cubren `corrijo_cobros_de()`, que da `false` a
quien no supervisa ni administra, y `verificar-cobros.js` en la página.

#### El pago adelantado se puede editar entero, y pagar en partes

Lo pidió el dueño después de usarlo: «adelantar N periodos» no dejaba tocar
nada (ni las fechas, ni el monto, ni cuánto se paga) y daba montos que «no
son». El caso real: una alumna con `pagado_hasta` del 15 de diciembre;
«adelantar 1» le emitió y le cobró **del 16 al 31 de diciembre (₡5 202,58)**,
porque `pago_adelantado()` contaba ese pedazo de mes como un periodo.

Ahora la ficha ya no llama a `pago_adelantado()` (queda en la base, sin uso):

- **Un plan se ofrece una sola vez** en «Qué paga». Se elige y la base propone
  el periodo que sigue (`cobro_siguiente(suscripción, periodos)`): desde el
  primer día que nada cubre —el inicio del plan, `pagado_hasta` o un cobro
  vigente del plan— y N periodos del plan desde ahí, así que desde el 16 de
  diciembre un mes llega al 15 de enero y vale un mes (₡10 080 con la beca del
  28 %, no ₡5 202,58). Respeta el `fin` del plan. Después `cobro_cotizar()`
  propone el concepto y el monto.
- **Todo se puede cambiar antes de registrar**: las dos fechas (vuelve a
  cotizar), el concepto y el monto.
- **Pago parcial**: «Paga hoy» (en blanco, todo). El cobro se emite por el
  monto entero y se paga solo lo que trajo, con su recibo; lo que falta queda
  pendiente en ESE cobro, como cualquier saldo (sale en «Cobros», con sus
  avisos, y se termina de pagar desde ahí). Vale también para «Otra cosa».
- **Lo que el plan debe se dice, no se paga callado.** `cobro_siguiente()`
  devuelve los cobros del plan que siguen pendientes y la ayuda los nombra:
  se pagan en «Cobros», o se anulan si no van. Antes «adelantar» los pagaba
  primero sin decirlo, y eso es parte de por qué el monto sorprendía.
- Lo registra `registrar_cobro_y_abono()`: el cuerpo de
  `registrar_cobro_pagado_con_periodo()` con `p_pagado`, que no puede ser 0 ni
  más que el monto. Lleva otro nombre por lo de PostgREST con dos firmas (ver
  `paquete_guardar()`), y la de siempre quedó como una línea que la llama.

Comprobado en la base, en una transacción revertida, con la cuenta real de la
coordinadora de ADAPZ y esa alumna: el periodo que sigue sale del 1 al 31 de
enero (el cobro del 16 al 31 de diciembre sigue vigente con su recibo
anulado, y la respuesta lo nombra entre los pendientes junto con los ₡80 de
octubre); del 16 de diciembre al 15 de enero cotiza ₡10 080 y dice con qué
choca; pagar ₡4 000 de enero deja el cobro en ₡10 080 con ₡6 080 pendientes;
y pagar 200 de un cobro de 100 se rechaza.

**El «Token inválido» al ver un recibo** era el token guardado al cargar la
página: vence a la hora y `sb` lo renueva por dentro sin que la variable
`session` se entere. `llamarCobros()` y `llamarCorreos()` lo piden fresco en
cada llamada (`tokenFresco()`), como ya hacía `llamarInformes()`.
`verificar-cobros.js` cambia el token después de cargar y mira que vaya el
nuevo.

**Al tocar esto, correr `node herramientas/verificar-cobros.js`** (las tres
caras: quien coordina, quien supervisa y la alumna) **y
`node herramientas/verificar-recibo.js`** (el HTML del recibo, sin navegador).

### De qué día a qué día cubre un cobro

Cada cobro dice qué días cubre (`periodo_inicio` a `periodo_fin`) y todo eso
se puede elegir y corregir: hay quien ya pagó por fuera y le queda menos
tiempo, quien entra a mitad de mes, quien paga dos semanas o mes y medio,
quien cambia de plan a medio periodo. Hasta esto el periodo era siempre el del
calendario, y la corrida diaria decidía si ya estaba emitido mirando **solo el
día en que arranca** (el índice único `suscripcion_id + periodo_inicio`):
cualquier cobro que no arrancara el día 1 dejaba el mes «libre» y la corrida
lo volvía a cobrar entero, sin dar ningún error.

**La pregunta de la corrida ahora es «¿qué parte de este periodo ya está
cubierta?»** (`interno.emitir_cobros()`, migración `cobros_periodo_editable`).
Lo cubren dos cosas: cualquier cobro de esa suscripción que se le cruce
—también uno anulado: anular un mes sigue queriendo decir «este mes no se
cobra»— y `suscripciones.pagado_hasta`.

- Cubierto entero: no se emite nada. Alargar un cobro de setiembre hasta
  noviembre hace que octubre y noviembre ya no salgan.
- Cubierto a medias: lo decide `suscripciones.medio_periodo`.
  `proporcional` (el de fábrica) emite un cobro por los días que faltan, con
  el precio por la fracción de días («Mensualidad · 21 al 31 de octubre 2026
  (proporcional)», 11/31 del mes); `siguiente` no cobra nada y espera al
  periodo siguiente, completo.
- Nada cubierto: el cobro de siempre, con el mismo concepto y el mismo monto.
  Con `pagado_hasta` vacío la corrida hace exactamente lo de antes.
- Lo que queda ANTES de un cobro dentro del mismo periodo no se cobra: si se
  pagaron del 15 de octubre al 14 de noviembre, del 1 al 14 de octubre queda
  libre. Para cobrar esos días se registra otro pago a la medida.
- Un periodo a medias nunca se cobra más allá de `fin`, y el vencimiento de un
  cobro proporcional nunca cae antes del primer día que cubre.

**Dos cobros vigentes de un mismo plan no pueden cubrir el mismo día**, y eso
lo garantiza la restricción de exclusión `cobros_sin_periodos_cruzados` (con
`btree_gist`), no un `if`: un cobro corregido a mano, un pago a la medida o
reactivar un anulado que se cruce con otro se rechazan con 23P01, que la
página traduce (`errorDeCobro()`). Solo cuenta entre cobros `emitido` con
plan: un anulado no cobra nada y uno suelto (una inscripción) no cubre ningún
periodo.

**En la página:**

- **«Poner alumnos en un plan» → «El primer cobro»**: el periodo completo (lo
  de siempre, `pagado_hasta` vacío), solo los días que quedan desde «Desde»
  (`pagado_hasta` = el día antes, `proporcional`) o «ya tiene pagado hasta»
  una fecha, con qué hacer si termina a mitad de un periodo. Son las mismas
  dos columnas vistas de tres maneras.
- **«Editar» en cada suscripción** cambia todo lo suyo: desde, pagado hasta,
  qué hacer a medias, termina el, día de vencimiento y beca. Lo escribe quien
  coordina con la RLS de siempre (`suscripciones_coordinacion`) y vale de acá
  en adelante: lo ya emitido no cambia.
- **«Corregir» un cobro** (quien supervisa o administra, como el resto de la
  corrección: `cobros_corrige_supervision` ya miraba el periodo) trae «Cubre
  desde» y «Cubre hasta». Se escribe un día (`2026-10-15`) o un mes entero
  (`2026-10`: desde el 1, hasta el último día; `leerFecha()`). Si el concepto
  no se tocó y termina en el periodo («Mensualidad · agosto 2026»), se rehace
  con el periodo nuevo usando `rango_es()`, la misma función que usa la
  corrida: si no, el recibo diría agosto y cubriría otra cosa. Uno cambiado a
  mano se respeta.
- **«Pago adelantado o sin cobro previo»** ofrece, por cada plan del alumno,
  «un periodo a la medida»: se eligen las dos fechas y
  `cobro_cotizar()` propone el concepto y el monto (la misma cuenta de la
  corrida, `interno.monto_rango()`: cada periodo del plan aporta su precio por
  la fracción de sus días que cae adentro, con la beca), que se pueden
  cambiar; si esos días ya están en un cobro vigente del plan lo dice antes
  de apretar. Lo registra `registrar_cobro_pagado_con_periodo()`, que ata el
  cobro al plan (`suscripcion_id`), así la corrida ya no cobra esos días. La
  moneda es la del plan, siempre. En «Otra cosa» las dos fechas son
  opcionales.
- **Cada cobro dice qué días cubre** en su tarjeta: siempre los de un plan, y
  los sueltos solo si se les dijo un periodo (si no, su «periodo» es el día en
  que se pagaron y no cubre nada).

**`registrar_cobro_pagado()` quedó como una línea** que llama a
`registrar_cobro_pagado_con_periodo()` sin periodo. La función nueva lleva
otro nombre porque con el mismo y dos firmas PostgREST elegiría una según los
parámetros que lleguen (ver `paquete_guardar()`); y la vieja no se borró
porque un `DROP` desde las herramientas de la sesión pide una confirmación que
una sesión sin nadie mirando no puede dar, y se queda esperando. Borrarla es
seguro el día que alguien lo haga desde el SQL editor: la página ya no la
llama.

Comprobado en la base, en transacciones revertidas: con `pagado_hasta` del 20
de agosto, `proporcional` emitió del 21 al 31 de agosto (₡10 645,16 de
₡30 000), setiembre y octubre completos, y la segunda corrida 0; con
`siguiente`, solo setiembre y octubre; alargar setiembre hasta noviembre se
rechaza mientras octubre esté vigente, y anulado octubre sí, y la corrida a
diciembre emite solo diciembre; acortar octubre al 15 hace que la corrida
cobre del 16 al 31 (₡15 483,87); impersonando a administración, cotizar del
15 de octubre al 14 de noviembre da ₡30 451,61 (17/31 + 14/30), pagarlo emite
el cobro atado al plan con su recibo, pagar noviembre encima se rechaza con
el nombre del cobro que choca, una sola fecha y fechas al revés se rechazan,
un pago suelto con periodo y la función vieja siguen andando, y después la
corrida emite solo del 15 al 30 de noviembre (proporcional) y diciembre; una
alumna recibe «Ese alumno no es de tu coordinación» al cotizar y al pagar, y
`anon` no tiene execute sobre las funciones nuevas.

**Al tocar esto, correr `node herramientas/verificar-cobros.js`**: comprueba
qué manda cada una de las tres opciones del primer cobro, que sin la fecha de
lo pagado no se mande, que «Editar» mande todo a ESA suscripción (y que
`2026-10` sea hasta el 31, que un 30 de febrero y terminar antes de empezar
no se manden), que corregir el periodo mande las dos fechas y rehaga el
concepto (y respete uno cambiado a mano), que el periodo a la medida le
pregunte a la base, escriba lo que propone y lo registre atado al plan, y que
cada cobro diga qué cubre. Rompiendo a propósito el día antes de «Desde», el
plan del pago a la medida y el periodo de la corrección saltan 4
comprobaciones.

### Pasarela y factura electrónica

**No hay pasarela de pago, por decisión explícita**: el cobro se registra a mano
(SINPE Móvil, transferencia o efectivo), que es como funciona de verdad la
mayoría de academias acá y no necesita ninguna credencial. `pagos.metodo` ya
contempla `tarjeta`, así que enchufar una pasarela (ONVO Pay, Tilopay) es sumar
quién escribe esa fila, no rehacer el modelo.

**Tampoco se emite factura electrónica de Hacienda**, pero las tablas ya tienen
sus campos (`cobros.hacienda_clave`, `hacienda_consecutivo`, `hacienda_estado` y
la tabla `datos_facturacion`) para no tener que migrar después. El consecutivo
de hoy es el del **recibo interno** (`AI-2026-000123`). Emitir de verdad pide
credenciales de ATV y certificado de firma digital, que son un trámite del
dueño del negocio, no código.

**Al tocar cobros.html, correr `node herramientas/verificar-cobros.js`** (con el
sitio en localhost:8777 y playwright). Comprueba en un navegador de verdad las
dos caras de la página, que no recalcule situaciones, qué manda al crear un
plan, al poner a un alumno en un plan, al registrar un pago y al anular, y que
el CSV salga con punto y coma y BOM.

### Cobros no es de profesores, y la lista ya no se baja entera

Dos cosas que cambiaron en esta pantalla, por dos razones distintas:

- **Quien da clase y no coordina no ve NADA de cobros.** Antes caía en «Mis
  pagos» y veía una lista vacía —a una cuenta de profesora no se le cobra—, que
  se lee como una página rota en vez de como «esto no es tuyo»; ahora se le
  dice con todas las letras de quién es la página. La tarjeta **«Mis pagos» se
  fue del panel entero**, también para el alumnado: las mensualidades son cosa
  de la casa, no de quien entra a entrenar. La página sigue enseñándole a cada
  quien sus propios recibos si entra por la dirección —lo que se quitó es el
  camino, no el derecho a ver lo suyo—. Comprobado impersonando roles en SQL:
  un profesor sin coordinación recibe **0 filas** de `cobros`, `cobros_vista`,
  `planes_cobro`, `suscripciones` y `cobros_contacto`.
- **El filtro y el corte los hace la base.** Esta página se bajaba los cobros
  con un `.limit(1000)` y filtraba en el navegador: es la misma piedra de
  `informes.html` y del registro de clases —PostgREST corta la respuesta a
  partir de cierta cantidad de filas SIN DAR NINGÚN ERROR—, y con una
  mensualidad por alumno y por mes ese techo se cruza en un par de años de
  academia. A partir de ahí la página habría empezado a esconder cobros en
  silencio, y los totales de arriba (que sí salen de la base) habrían dejado de
  cuadrar con la lista sin que nadie supiera por qué.
  - Ahora vienen de treinta en treinta, con su cuenta total (`count: "exact"`),
    su búsqueda por concepto o número de recibo y su «Ver más».
  - Y **agrupados por mes**, con el más nuevo abierto y los de atrás cerrados:
    con trescientos recibos de corrido no se encuentra ninguno. Es el mismo
    patrón del registro de clases del panel. El encabezado de cada mes dice
    cuántos hay y cuánto queda sin pagar, **por moneda** — sumar colones con
    dólares daría un número que no significa nada.
  - El **CSV baja lo que cumple el filtro, no lo que se alcanzó a pintar**, y
    lo pide de mil en mil: quien filtró por «vencidos» quiere los vencidos, no
    los treinta primeros.
  - El texto de búsqueda se limpia antes de mandarlo: PostgREST arma el `or=(…)`
    con comas y paréntesis, así que un concepto con una coma rompería la
    consulta entera. Y cada consulta lleva su marca, para que una respuesta que
    llega tarde no pinte el resultado de un filtro que ya no está.
- **La ficha que quedó abierta se recuerda**, como las pestañas de la clase en
  vivo: registrar un pago recarga la página entera y volver siempre a «Cobros»
  obliga a buscar otra vez dónde se estaba.
- **Desde Morosidad se llega a corregir el correo**, con el alumno ya elegido:
  el momento de darse cuenta de que el correo está mal es justo ese, viendo que
  alguien lleva 40 días de atraso al lado de la dirección a la que le estuvimos
  escribiendo. Y la fila dice **a qué correo se le avisa**, o avisa de que no
  hay ninguno.

**Al tocar `cobros.html`, correr `node herramientas/verificar-cobros.js`.**
Comprueba además de lo de siempre: que los cobros se pidan con su cuenta y con
un rango (si alguien vuelve a bajárselos todos, la página se ve igual de bien
hasta que hay más de mil), que se agrupen por mes con solo el primero abierto,
que buscar pregunte a la base, que una profesora no reciba **ni un cobro**, que
el número de las familias salga de los ajustes y no escrito en la página, que
un número de tres dígitos no se guarde, y qué manda la ficha de contacto al
corregir cada uno de los tres correos.

## El acceso a la plataforma: paquetes, cupos y un interruptor

Hasta esto, una cuenta de alumno valía para siempre: `cobros.html` registraba
quién pagaba, pero **nada cortaba el acceso de quien no pagaba**. Cobrar por el
acceso sin poder cortarlo es pedir una contribución voluntaria.

**El modelo es uno solo: un paquete.** `paquetes_acceso` (nombre, titular,
cupos, desde, hasta, precio) y `paquete_alumnos` (quién ocupa cada cupo). Una
cuenta individual **es un paquete de 1 cupo**, no un segundo mecanismo: con dos,
el día que se corrija la regla de vigencia en uno el otro seguiría diciendo lo
de antes.

- **Nadie escribe estas tablas desde el navegador** (no tienen política de
  insert/update/delete, y el permiso de tabla se le quitó a `authenticated` y a
  `anon`), igual que `profile_teachers` y `equipos`. Escriben cuatro funciones
  `SECURITY DEFINER`: `paquete_guardar()` y `paquete_borrar()` (solo
  administración), `paquete_set_alumnos()` y `acceso_set_exigido()`.
- **`paquete_set_alumnos()` deja la lista EXACTAMENTE como llega** (la regla de
  `set_teachers`) y **rechaza lo que no cabe en los cupos**, con los dos
  números. El cupo lo hace cumplir la base: en la pantalla solo se avisa antes.
- **El titular del paquete** (un profesor que compró cupos para sus alumnos)
  también reparte, pero solo a sus propios alumnos (`soy_profesor_de()`), y **lo
  que ya estaba y no es suyo se conserva**, como en `coord_set_profesores()`:
  la pantalla del titular no ve a quien puso administración, y mandarle la lista
  sin él lo sacaría sin que nadie lo pidiera. No puede tocar los cupos ni las
  fechas: eso es lo que se pagó.
- **Quién ve un paquete** lo contesta `puede_ver_paquete()`: administración, su
  titular, quien coordina al titular y, si el titular es una academia, su
  supervisor. **El alumno NO ve la fila del paquete**
  (su nombre, su precio): ve su propio renglón de `paquete_alumnos` y lo que le
  diga `mi_acceso()`.

### El titular puede ser una academia

Lo que se vende casi siempre es «la academia X compra 50 cupos», y un profesor
de titular no sirve para eso: los cupos quedarían atados a una persona que
puede irse, y el que de verdad reparte es el supervisor. Por eso
`paquetes_acceso.academia_id`: el titular es **una academia o un profesor,
nunca los dos** (lo impide el CHECK `paquetes_acceso_un_titular` y
`paquete_guardar()` lo rechaza con su mensaje).

- **Lo reparte el supervisor de esa academia, y solo entre sus MIEMBROS**
  (`academia_miembros`) — la misma regla del supervisor en todo lo demás: un
  profesor puede estar en dos academias, y sus alumnos de la otra no son de
  este supervisor. Lo que ya estaba en el paquete y no es miembro **se
  conserva**, igual que con el titular profesor: la pantalla no puede quitar lo
  que no le corresponde.
- **Cambiar de supervisor no toca el paquete**: la pregunta es «¿supervisas la
  academia titular?», así que el nuevo lo reparte desde el primer día.
- **En pantalla el selector recorta a los miembros** (`candidatos()` de
  `accesos.html`). El supervisor VE a más alumnos que esos —la RLS de
  `profiles` le abre todo lo que está bajo su coordinación—, y sin el recorte le
  ofrecería a alguien que la base rechaza: el fallo lo descubriría al apretar.
- `paquete_guardar()` quedó con **una sola firma** (la vieja se borró): con dos,
  PostgREST elegiría una según los parámetros que lleguen.
- El supervisor llega por «🎟️ Cupos de tu academia» (grupo Administración de su
  panel); sin ningún paquete de su academia, la página le dice que no es para
  su cuenta y quién se lo arma.

Comprobado impersonando cuentas reales en SQL (revertido): un paquete con
academia y profesor a la vez se rechaza; la supervisora de ADAPZ ve el paquete
y suma a dos miembros; un alumno de fuera se rechaza, igual que subirse los
cupos; el supervisor de OTRA academia no lo ve ni lo reparte; el alumno no ve
ninguna fila de paquetes y `mi_acceso()` le dice `paquete`; y vaciar la lista
desde la supervisora deja al alumno ajeno que había puesto administración.

### `mi_acceso()` es la única pregunta

Devuelve si quien mira puede usar la Academia hoy, hasta cuándo y por qué. Las
fechas se cuentan **en hora de Costa Rica** y `vigente_hasta` **está incluido**.
El equipo docente y administración dan `vigente` siempre: el acceso que se
vende es el del alumno.

**`acceso_config.exigido` arranca en `false`, y eso fue lo que permitió aplicar
esto sin cerrarle la Academia a nadie**: con el interruptor apagado,
`mi_acceso()` contesta vigente para todo el mundo, así que los paquetes se
pueden ir armando sin que ningún alumno note nada. Lo enciende quien administra
desde `accesos.html`, con dos toques y con el número de cuántos quedarían fuera
escrito en el botón.

Comprobado impersonando roles en SQL, en una transacción revertida, 15 casos:
el alumno no crea paquetes ni enciende el interruptor, el cupo se rechaza con
sus números, el titular suma a su alumno y no a uno ajeno ni se sube los cupos,
el alumno ve su renglón y **0 filas** de paquetes, con el interruptor encendido
el que no tiene paquete queda fuera y el vencido también, y `anon` no puede
llamar a nada.

### Lo que tapa la pantalla, y lo que NO

`js/acceso-vigente.js` va en las páginas de la Academia (lo pone
`academia-cabecera.py`, en la MISMA lista que la burbuja) y hace lo que diga
`mi_acceso()`: en el panel **avisa** (y avisa también 7 días antes de que
venza); en cualquier otra página **tapa** el contenido y dice por qué y a qué
WhatsApp escribir.

- **`cobros.html` y `configuracion.html` quedan fuera a propósito**: son por
  donde se arregla (ver qué debe, cambiar la contraseña). Taparlas cerraría la
  puerta de salida.
- **Si la consulta FALLA, no se tapa nada.** Una función que falta o una red
  caída no pueden dejar fuera a todos los que sí pagaron.
- **La pantalla es solo la cara: el candado está en la base** (ver abajo).

### El candado de verdad: políticas RESTRICTIVAS

`public.acceso_vigente()` contesta lo mismo que `mi_acceso()` —de hecho
`mi_acceso()` saca su `vigente` de ahí, para que no puedan contradecirse— y
**solo sobre quien llama**: no recibe ningún id, así que no sirve para averiguar
si otro alumno pagó. Con `auth.uid()` nulo (la service role, las tandas de
`pg_cron`) da `true`.

- **Se sumaron políticas `AS RESTRICTIVE`, no se reescribió ninguna.** Una
  restrictiva se combina con AND con las que ya existen, así que las 38
  políticas de profesor quedaron intactas. Van con `(select
  public.acceso_vigente())` para que se evalúe una vez por consulta y no por
  fila.
  - **Insert**: `training_progress`, `training_state`, `platform_activity_log`,
    `class_presence_log`, `class_attendance`, `question_answers`,
    `question_engine_answers`, `desafios`, `game_rooms`, `practice_games`,
    `puzzle_rush_scores`, `tournament_registrations`.
  - **Update**: las mismas que se actualizan, más `fourplayer_games` y
    `tarea_items`.
  - **Select**: solo lo que ES la clase en vivo —`game_state`, `variant_nodes`,
    `questions`, `practice_sessions`—. **Su progreso lo sigue pudiendo leer**:
    la pantalla le promete que no se pierde, y el chat con su profe queda
    abierto para arreglarlo.
- **Tres puertas escriben con `SECURITY DEFINER`**, que se salta la RLS:
  `iniciar_examen()`, `responder_examen()` y `aceptar_desafio()`. En vez de
  reescribirlas, un **trigger** (`exigir_acceso_vigente()`) en
  `examen_respuestas`, en `examenes` al pasar de `asignado` a `en_curso` y en
  `game_rooms` — los triggers corren aunque escriba una función con otros
  privilegios.
- **El profesor nunca queda atrapado**: la pregunta es sobre quien llama, así que
  pasar lista presencial a un alumno que no pagó sigue funcionando.
- Comprobado impersonando roles en SQL: sin exigir nada cambia; exigido y sin
  paquete, el alumno ve **0 filas** de la clase, su insert de progreso y de
  tiempo se rechaza con 42501, su update cambia 0 filas y el examen dice «Tu
  acceso a la Academia no está activo»; con paquete vuelve a todo; el profesor
  sigue viendo su tablero.
- **Los archivos de los cursos los cierra el worker con la misma pregunta**:
  `cursos/protegido/` y `cursos/recursos/` le preguntan `acceso_vigente()` a
  Supabase con el token de quien los pide (ver «El candado de los cursos está
  en el servidor»). Los bancos de ejercicios de `js/` (`*-items.js`) siguen
  siendo archivos públicos: los usan páginas que se abren sin cuenta.

### El tiempo de entrenamiento dejó de registrarse, y nadie se enteró

Probando este candado apareció un fallo que no era suyo: **del 22 de septiembre
a las 05:01 UTC en adelante no entró ni una fila a `platform_activity_log`**. La
migración `ficha_de_asistencia_presencial` le había sumado a
`proteger_tiempos_de_presencia()` una excepción escrita como `TG_TABLE_NAME =
'class_presence_log' and exists (… new.session_id …)`, y **PL/pgSQL resuelve
`new.session_id` aunque la primera mitad sea falsa**: en `platform_activity_log`,
que no tiene esa columna, cada insert tronaba con 42703. La página no dice nada
—el latido falla callado— así que los minutos de entrenamiento de todos
quedaron en cero en Informes, en Tareas y en el correo a la casa.

Se arregló leyendo la columna con `to_jsonb(new)->>'session_id'`, que en esa
tabla da null en vez de tronar. **Al escribir un trigger que comparten dos
tablas, nunca nombrar `new.<columna>` que una de ellas no tenga**, ni detrás de
un `and`. Los minutos de ese día y medio no se pueden recuperar: no se guardó
nada.

### Los precios están escritos UNA vez

`js/precios-acceso.js`: una cuenta a ₡3.000 al mes (`elegir-plan.html` lo lee
de ahí) y cinco tramos por cantidad
(10, 25, 50, 100 y colegio desde 300), más el profesor extra y el ciclo lectivo
(12 meses, se pagan 10). Lo leen `precios.html`, `accesos.html` (que propone el
precio al armar un paquete) y `elegir-plan.html`.

- **El total se CALCULA, eligiendo el tramo más barato para esa cantidad**
  (`cotizar()`): sin eso, 9 alumnos costaban más que 10, y se le cobraría de
  más a quien no hizo la cuenta.
- **`precios.html` no tiene ni un «₡» escrito.** Ya está abierta a los
  buscadores y en el sitemap: todos los «Inscríbete» del sitio llevan ahí.
- Los cupos de profesor de cada tramo son **informativos**: la base solo cuenta
  cupos de alumno.

**Al tocar los precios, `accesos.html`, `js/acceso-vigente.js` o las funciones
de paquetes, correr `node herramientas/verificar-accesos.js`** (con el sitio en
localhost:8777 y playwright; `--sin-navegador` corre solo el módulo). Comprueba
que comprar un alumno más nunca salga más barato (de 1 a 1000), que ninguna
página escriba un precio a mano, que el control esté en las 61 páginas y no en
las dos que quedan abiertas, que crear un paquete mande lo que se escribió (con una academia de titular, la
academia y ningún profesor), que al supervisor solo se le ofrezcan los miembros
de su academia —también al sumar un grupo—, que
**sumar un grupo mande la UNIÓN** y que uno que no cabe no se mande, que el
interruptor pida dos toques, que al titular no se le pinte el formulario, y que
el control tape con el acceso vencido, no tape con el vigente y **no tape si la
consulta falla**. Está probado que falla de verdad: haciendo que el grupo se
mande solo, saltan 3 comprobaciones.

## La prueba gratis de 3 días

Tres días de la Academia **sin correo y sin tarjeta**, que se cierran solos a
las 72 horas. **Se pide por WhatsApp y la crea quien administra**: así lo
decidió el dueño del sitio, para saber quién la pidió y escribirle. La primera
versión (#445) dejaba que cualquiera se la abriera desde la página con nombre y
contraseña; duró unas horas.

- **Quien la quiere** ve en `prueba-gratis.html` qué trae y el botón «Pedir mi
  prueba por WhatsApp», con el mensaje de interés ya escrito. `precios.html` la
  ofrece en cuatro lugares (arriba, en «Pruébalo gratis», en las preguntas y en
  el cierre) con el mismo mensaje, armado con el número de `#cta-wa` (una sola
  copia); sin JavaScript, esos enlaces llevan a `prueba-gratis.html`.
- **Quien administra** entra a la misma página (atajo «🎁 Prueba gratis» en
  `admin.html`, grupo Acceso a la plataforma) y ve el formulario: nombre, su
  WhatsApp (opcional, no se guarda) y una contraseña ya armada con dos palabras
  de ajedrez y dos cifras, que se puede cambiar. Marca que la persona conoce y
  acepta los Términos y la Política —van en el mensaje—, y al crear la página le
  da el usuario **que devolvió el servidor** (numera si el nombre ya está:
  `sofia.munoz2`) y un botón que abre el WhatsApp de la persona con el usuario,
  la contraseña, el enlace para entrar, hasta cuándo dura y los dos enlaces
  legales. No inicia sesión con la cuenta nueva: quien administra sigue en la
  suya. La cara de administración la decide `soy_admin()`; si alguien la fuerza
  desde la consola, la función igual lo rechaza.

**Sin correo, la cuenta es la de un alumno sin buzón.** La Edge Function
`prueba-gratis` le arma un usuario del dominio `alumno.ajedrez-integral.com`
con `usuarioLibre()`, la misma regla de las dos puertas de alta.

**El corte lo hace la base, y NO depende del interruptor.** `pruebas_gratis`
guarda `vence` (`now() + 3 days`), y `acceso_vigente()` pregunta por la prueba
**antes** que por `acceso_config.exigido`: con el interruptor apagado, una
cuenta de alumno normal entra sin límite, y la de prueba no. Al vencer se le
cierran las políticas restrictivas, los tres triggers y el candado de los
cursos en el worker —todo lo que ya preguntaba `acceso_vigente()`—, sin que
nada tenga que correr el tercer día. Con un **paquete vigente** vuelve a
entrar: comprar es meterla en un paquete, con el mismo usuario y su progreso.
`mi_acceso()` dice `prueba` (con `vence` y `horas`) o `prueba_vencida`, y
`js/acceso-vigente.js` avisa en el panel cuánto le queda y, al vencer, tapa
con «Tu prueba gratis terminó» y dos salidas: los precios y el WhatsApp.

- **La función solo acepta a quien administra**: `verify_jwt` en true y,
  además, `is_admin` del perfil de la sesión. Por eso no tiene freno: no queda
  ninguna puerta pública que abra cuentas (la migración
  `prueba_gratis_la_crea_administracion` borró `prueba_gratis_frenar()`; el
  tipo `prueba` de `interno.frenar_envio_publico()` quedó sin uso).
- **Una cuenta sin su fila de prueba sería acceso gratis para siempre**
  (mientras el interruptor esté apagado). Por eso la función la crea
  **bloqueada** (`ban_duration`), guarda el vencimiento con
  `prueba_gratis_activar()` y solo entonces la desbloquea. Si la activación
  falla, la borra; si hasta el borrado falla, queda bloqueada, nunca abierta.
- **`prueba_gratis_activar()` solo la llama la service role.** Exige las
  versiones legales aceptadas (`version_legal_valida`) y rechaza una cuenta que
  no se creó en los últimos 10 minutos: no sirve para ponerle fecha de corte a
  un alumno que ya existía. La fila no tiene política de escritura; el alumno
  ve la suya y administración todas. La columna `ip` queda en null desde que la
  crea administración.
- **La contraseña no se puede recuperar por correo**, porque no hay correo ni
  persona encargada: los Términos (`#prueba`) dicen que se escribe por
  WhatsApp, y el mensaje con el acceso pide anotarla.

Comprobado impersonando roles en SQL, en una transacción revertida y con el
interruptor apagado: durante la prueba `acceso_vigente()` da true y el alumno
escribe su tiempo; con `vence` en el pasado da false y el insert de
`platform_activity_log` se rechaza con 42501; `anon` no puede activar y
`activar` rechaza a un alumno viejo. La función, llamada de verdad: en su
primera versión creó una cuenta de 3 días a la que se entró con su contraseña
(se borró después); en la de administración rechaza sin sesión y con la clave
pública («La sesión no es válida.»). El camino de administración es el mismo
código ya probado, después de la comprobación de `is_admin`.

**Al tocar la prueba, `acceso_vigente()` o `mi_acceso()`, correr
`node herramientas/verificar-prueba-gratis.js`.** Lee `supabase/` (que la
última `acceso_vigente()` pregunte por la prueba antes que por el interruptor,
los permisos, y el orden administración → crear bloqueada → activar →
desbloquear de la función) y prueba en el navegador la cara pública, la de
administración, `precios.html` y el aviso. Está probado que falla de verdad:
con la pregunta por la prueba después del interruptor, con el desbloqueo antes
de activar y sin la comprobación de `is_admin`, salta.

## La tienda de materiales: montada, con precio, y todavía cerrada

`tienda.html` es el catálogo de venta de lo que este repositorio ya produjo:
los doce cursos con su material de clase y los cinco libros y guías. **Cada
material vale ₡5.000** —salvo uno, abajo—, y los seis módulos del anuncio
—«¿Eres entrenador de ajedrez?»— son la forma en que se presenta el paquete
completo.

**Hoy solo la ve quien administra**, a propósito: está montada entera para
poder revisarla antes de abrirla, no para vender todavía. El candado es
`is_admin` a secas y **no `soy_coordinador()`**: esto no es una herramienta de
coordinación, es una página de venta que todavía no es de nadie, y quien decide
cuándo abre es quien administra. En el panel la tarjeta vive **solo en el panel
de administración (`ADMIN_GROUPS` de `clases.html`)**, no con
`mantenimientoAlumno`: aquella palabra dice «esto vuelve» y se la seguiría
enseñando al equipo docente, y lo que hay que decir acá es que todavía no es
suya. El día que abra, se suma la tarjeta al grupo del público que toque.

### El catálogo es la única fuente, y el precio está escrito UNA vez

`js/tienda-catalogo.js` tiene los productos, los seis módulos, los cinco bonos
y el precio. La página **no tiene ni un producto ni un precio escrito a mano**:
pegar la misma ficha diecisiete veces es exactamente como terminaron las diez
tarjetas de `cursos.html` antes de `herramientas/cursos/catalogo.json`, y ahí
cambiar el diseño son diecisiete ediciones y es cuestión de tiempo que una
quede distinta.

- **Un módulo no es un producto: es un grupo de productos**, y por eso solo
  guarda sus ids. Así el anuncio no puede prometer un curso que el catálogo no
  tiene.
- **El precio del paquete se CALCULA**, no se escribe: es la suma de los
  materiales menos un descuento, redondeada al millar para que se pueda pagar
  por SINPE sin monedas. Escribir «₡51.000 en vez de ₡85.000» a mano deja las
  dos cifras mintiendo en cuanto se sume un material más. Es la misma decisión
  de `cobros.estado` y del avance de una tarea: lo que se deriva de una lista
  no se guarda aparte.
- **El «ver el material» de cada ficha se calcula igual** (un curso es su
  portada pública, un libro es su primer archivo) en vez de escribirse
  diecisiete veces, donde el que se olvidara quedaría con un botón que no lleva
  a ninguna parte.

### Un material con su propio precio: «Una clase al día»

El dueño pidió poner en la tienda «Una clase al día» (entonces «Las mil y una
lecciones de ajedrez») y
calcularle el precio. A ₡5.000 habría valido lo mismo que un curso de diez
lecciones, y son 360. El precio **no se puso a ojo: sale de las dos reglas que
la tienda ya tenía**. Son doce bloques, cada uno del tamaño de un curso grande
del catálogo (de 6 a 58 lecciones, 30 en promedio; los demás cursos traen de 10
a 36) y con su tomo del libro: doce materiales a `PRECIO` son ₡60.000, y con
`DESCUENTO_PACK` (el 40 % de llevarse muchos juntos), **₡36.000**: ₡100 por
lección, contra unos ₡290 de los demás cursos.

- **El precio se calcula en el catálogo**, con `PRECIO` y `DESCUENTO_PACK`: si
  el dueño cambia cualquiera de los dos, este se mueve solo. Un producto puede
  traer `precio`; sin él, vale `PRECIO` (`precioDe()`).
- **Todo lo que sumaba «cuántos × PRECIO» pasó a sumar el precio de cada uno**:
  el suelto del paquete, la barra de la selección y el mensaje de WhatsApp. El
  verificador elige este curso en la prueba de la selección, porque con dos a
  ₡5.000 la cuenta vieja pasaba igual (se comprobó rompiéndola).
- La frase «cada material, por su cuenta, a ₡5.000» pasó a decir «desde», con
  el más barato (`precioMinimo()`).
- Va en el módulo 4, «Comprensión, criterio y partidas modelo». **El paquete
  completo subió de ₡54.000 a ₡76.000** (₡126.000 por separado): entra al
  sistema completo como todo producto, porque fuera de los módulos se vendería
  algo que el paquete no entrega.
- Sus piezas son sus doce tomos y sus doce versiones accesibles
  (`tomos`, `tomosAccesibles`), contadas contra el disco como las demás.

### Lo que se rompe callado acá, y lo caro que sale

Todo esto se ve perfecto en pantalla y lo descubre **quien ya pagó**, que es el
único que no puede arreglarlo:

- **Un producto que apunta a un archivo que ya no está.** La ficha se pinta, se
  cobra, y no llega nada.
- **Un número inventado** («27 cuadernillos» donde hay 24). Nadie los cuenta: se
  leen y se creen. Por eso `piezas` **se cuenta contra el disco**, la misma
  regla que el resultado de cada posición de un curso, que se verifica con motor
  y no a ojo.
- **Un curso fuera de los seis módulos** —el «sistema completo» vende algo que
  no entrega— **o metido en dos**, que lo cobra dos veces.
- **Un precio que dice una cosa en la ficha y otra en el mensaje de WhatsApp.**
  Por eso el pedido se arma en UNA función para el paquete y para la selección.
- **Un `wa.me` sin código de país**: abre un chat con un número que no existe y
  se ve como un enlace perfecto. El número sale de `ajustes_academia`
  (`whatsapp_consultas`), no escrito en la página, y **si no hay ninguno no se
  inventa uno**: los botones lo dicen en vez de abrir la nada. Misma regla que
  el informe a la casa.
- **Y la que no se puede deshacer: que la tienda se le pinte a alguien mientras
  está cerrada.** Por eso el verificador mide que a quien no administra no le
  quede ni un control al que llegar con el teclado **y que no haya ni un «₡» en
  el código de la página** — eso último vale doble: es la prueba de que ningún
  precio está escrito a mano, porque todos salen del catálogo, que solo se
  pinta si quien mira administra.

### La burbuja le tapaba el botón de comprar

`tienda.html` está en `SIN_BURBUJA` de `herramientas/academia-cabecera.py`, con
`sesion.html` y `examen.html`. No es que sobre: **la burbuja de «quién está en
línea» flota fija abajo a la derecha y la barra de la selección va fija abajo**,
así que «Pedir por WhatsApp» quedaba literalmente debajo de ella y no se podía
apretar. No daba ningún error —se veía perfecto— y lo habría descubierto quien
quisiera comprar. Encima, «0 alumnos en línea» no tiene nada que decir en una
página de venta. El verificador mide **quién está de verdad en el punto donde
uno toca el botón**, no que el botón exista: cualquier cosa que algún día se
ponga a flotar en esa esquina salta ahí.

### No hay pasarela de pago, y eso ya estaba decidido

Se cierra por WhatsApp y se paga por SINPE Móvil, transferencia o efectivo —lo
mismo que las mensualidades de `cobros.html`, y por la misma razón: es como
funciona de verdad una academia acá y no necesita ninguna credencial. La entrega
es a mano, por correo.

Lo que antes quedaba por resolver antes de abrirla —que `cursos/recursos/`
tuviera el candado de la Academia y no uno por compra, y que los libros de la
raíz no tuvieran ninguno— ya está resuelto: ver «La tienda con permiso por
producto», abajo.

### La tienda con permiso por producto

Hasta acá, lo que la tienda vendía se lo bajaba gratis quien supiera la
dirección: `cursos/recursos/` tenía el candado de la Academia (cualquier cuenta
con el acceso al día, no quien compró ESE material) y los libros de la raíz
—el del diagnóstico, el cuadernillo, el de arbitraje, la guía del profesor—
ninguno. Se veía perfecto y no daba ningún error.

- **Quién compró qué está en la base**: `compras_tienda` (una fila por persona y
  producto; la llave primaria impide registrarla dos veces). No tiene política
  de escritura: la escribe `registrar_compra(persona, producto, registrar)`,
  que es `SECURITY DEFINER` y rechaza a quien no administra (42501). La
  pantalla es la sección «Compras registradas» de `tienda.html`
  (`js/tienda-compras.js`): se busca la cuenta por nombre o correo (en la base,
  de a diez), se elige el material y se registra; «Quitar la compra» pide
  confirmación.
- **La pregunta es `puede_bajar(producto, basta_el_acceso)`**, `SECURITY
  INVOKER` a propósito: solo mira la compra de quien pregunta (la RLS no le
  deja ver otras), así que no es una API sobre otra persona. Contesta sí a
  administración, a quien compró, y —solo si `basta_el_acceso`— a quien tiene
  el acceso vigente. Se comprobó impersonando roles en SQL: el alumno no puede
  registrar ni insertar; el acceso abre un curso pero no un libro; la compra de
  una persona no le abre nada a otra; `anon` no la puede llamar.
- **El worker decide por la carpeta** (`worker.js`, `queSePregunta()`):
  `cursos/recursos/<id>/` pregunta con `basta_el_acceso = true` (quien paga la
  Academia sigue teniendo el material de sus cursos, como siempre);
  `material/<id>/` con `false` (solo quien lo compró). `material/` sin carpeta
  no se sirve. La respuesta se guarda por token **y producto**: guardarla solo
  por token le abriría a quien compró un libro todos los demás.
  `run_worker_first` nombra `/material/*`; sin esa línea el candado no existe.
- **El producto ES el nombre de la carpeta**, el mismo id de
  `js/tienda-catalogo.js`. Si no son el mismo texto, la compra queda
  registrada y el material no abre nunca, sin ningún error:
  `verificar-tienda.js` lo comprueba.
- **Los libros se mudaron a `material/<id>/`** y sus generadores escriben ahí.
  Todos sus enlaces ya eran solo de administración, así que a nadie se le
  cerró nada que tuviera. Quedan en la raíz, **sin candado y a propósito**, dos
  archivos: `guia-del-profesor-accesible.html` (es la ayuda «?» de decenas de
  páginas; ponerle candado rompería la ayuda del sitio) e
  `instrucciones-adaptadas.pdf` (va adjunto en el correo de bienvenida y la
  Edge Function lo baja de la raíz). Venderlos es vender la comodidad de
  tenerlos, no el acceso.
- `sw.js` no guarda nada de `material/`: una copia en el teléfono se seguiría
  abriendo después de quitar la compra.
- **El pie de cada módulo cuenta ARCHIVOS** (`archivosDe()`): en un curso las
  piezas son archivos, en un libro no (son preguntas, páginas o fichas, y el
  libro es uno o dos PDF). Sumaba las piezas y el módulo de los libros decía
  «1.080 archivos» con 29. `verificar-tienda.js` cuenta los archivos en el
  disco y los compara con lo que dice cada módulo.
- **Las fichas de estudio en papel** (el libro y las cartas para recortar,
  `material/fichas-de-estudio/`) entraron al módulo 3, «Aperturas y técnica de
  finales». Quien las compra las baja desde la lista de Estudio (ver «Las
  fichas en papel: el libro y las cartas» en `entrenamiento.md`).


**Al tocar `js/tienda-catalogo.js`, `tienda.html` o el material que vende,
correr `node herramientas/verificar-tienda.js`** (con el sitio en
localhost:8777 y playwright). Existe porque la página está detrás del login
**y** detrás del rol: `verificar-css.js` abre las páginas sin cuenta y no ve
nada de esto. Comprueba el catálogo contra el disco —que todos los
productos apunten a archivos que existen, que las piezas que promete cada ficha
estén de verdad en la carpeta, y que ningún curso quede fuera de los módulos ni
metido en dos— y después, en un navegador de verdad, que el sello del anuncio
diga los módulos y los bonos que hay, que el pedido lleve exactamente lo que se
marcó y el mismo total que decía la barra, que el botón de pedido no lo tape
nada, que sin número de WhatsApp no se abra ningún chat, y que a quien no
administra no se le pinte ni un precio. Está probado que falla de verdad:
rompiendo la ruta de un curso, metiendo uno en dos módulos, inflando un número
de la ficha o quitándole el 506 al `wa.me`, salta cada vez.

**Al sumar un material a la venta** se escribe su ficha en `PRODUCTOS`, se lo
mete en UNO de los seis módulos, y se corre el verificador: si la carpeta, los
números o el módulo no cuadran, no pasa.
