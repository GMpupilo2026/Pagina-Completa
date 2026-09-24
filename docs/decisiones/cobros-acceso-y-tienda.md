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
  quien entra el 20 cubre ese mes completo.
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
  dato — la misma razón por la que `anularCobro()` y `registrarPago()`
  escriben directo. Cancelar es la misma fila con `estado: 'cancelado'`.
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

`js/precios-acceso.js`: una cuenta a ₡6.900 (el precio que ya ofrecía
`elegir-plan.html`, que ahora lo lee de ahí) y cinco tramos por cantidad
(10, 25, 50, 100 y colegio desde 300), más el profesor extra y el ciclo lectivo
(12 meses, se pagan 10). Lo leen `precios.html`, `accesos.html` (que propone el
precio al armar un paquete) y `elegir-plan.html`.

- **El total se CALCULA, eligiendo el tramo más barato para esa cantidad**
  (`cotizar()`): sin eso, 9 alumnos costaban más que 10, y se le cobraría de
  más a quien no hizo la cuenta.
- **`precios.html` no tiene ni un «₡» escrito**, y lleva `noindex`: es la tabla
  que se le enseña a una academia o a un colegio, y publicar precios en un
  buscador es una decisión que todavía no se tomó. Abrirla es quitar esa línea y
  correr `sitemap.py`.
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

## La tienda de materiales: montada, con precio, y todavía cerrada

`tienda.html` es el catálogo de venta de lo que este repositorio ya produjo:
los doce cursos con su material de clase y los cinco libros y guías. **Cada
material vale ₡5.000**, y los seis módulos del anuncio —«¿Eres entrenador de
ajedrez?»— son la forma en que se presenta el paquete completo.

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

**Antes de abrirla al público hay UNA cosa que resolver, y está escrita arriba
de la propia página**: `cursos/recursos/` ya tiene candado, pero es el de la
Academia —lo baja **cualquier cuenta con el acceso vigente**, no quien compró
ese material—, y los libros de la raíz siguen **sin ninguno**: quien conozca la
dirección exacta se los baja sin pagar, sin ningún error ni registro. Mientras
la entrega se haga a mano no cambia nada; el día que la tienda abra, lo que se
cobra aparte necesita un permiso por producto comprado. Va escrito EN LA PÁGINA y no solo acá porque es la decisión que hay que
tomar antes de apretar el botón de abrir.

**Al tocar `js/tienda-catalogo.js`, `tienda.html` o el material que vende,
correr `node herramientas/verificar-tienda.js`** (con el sitio en
localhost:8777 y playwright). Existe porque la página está detrás del login
**y** detrás del rol: `verificar-css.js` abre las páginas sin cuenta y no ve
nada de esto. Comprueba el catálogo contra el disco —que los diecisiete
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
