# Entrenamiento

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: ejercicios, progreso, logros, diagnóstico y los bancos de preguntas.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

## El progreso vive en la cuenta, no en el aparato

`js/progreso-usuario.js` espeja en Supabase (tabla `training_state`, una fila por
clave y alumno) las mismas claves de progreso que las páginas guardan en
`localStorage`, para que quien entrena en la compu siga donde iba al abrir el
celular.

- Las páginas **no cambian su forma de guardar**: siguen usando `localStorage` y
  el módulo intercepta las escrituras. Para sumar una página nueva: cargar el
  script y `await ProgresoUsuario.init()` antes de leer el progreso y pintar.
- **Toda clave de progreso nueva hay que declararla** en `CLAVES` con su forma de
  fusión; si no, no se sincroniza.
- Al juntar dos aparatos no gana "el último que escribió": los conjuntos de
  ejercicios resueltos se unen, las mejores marcas se quedan con la mayor y lo
  que es "por dónde iba" se queda con lo más avanzado. Entrenar en dos aparatos
  suma, no pisa.
- **La racha EN CURSO no es una marca**: `entreno_*_streak` (Mates, Táctica,
  Temas, Practicar, Visualización) va con **`ultimaEscritura`**: gana la que se
  escribió más tarde, en cualquiera de los dos aparatos. Con el máximo, fallar
  en el celular dejaba la racha en 0 y la compu la devolvía a 14; con «vale la
  de este aparato» (`ultimoLugar`, que se probó primero) la compu no se
  enteraba ni del fallo ni de la subida hecha en el celular, y encima la pisaba
  en la nube. La fecha local vive aparte, en `progreso_fechas_v1`, y la de la
  nube es el `updated_at` de la fila. La mejor racha sigue con el máximo.
- **El progreso guardado en el aparato tiene dueño** (`progreso_dueno_v1`).
  Las claves de `localStorage` no llevan el id de nadie, así que en una
  computadora del colegio lo que dejó Ana se fundía con la cuenta de Bruno al
  entrar él —ejercicios, marcas y hasta su diagnóstico, que Informes le pintaba
  a Bruno—. Si entra otra cuenta, lo del anterior se descarta sin fundirlo: ya
  está a salvo en la suya.
- **Un diagnóstico terminado no vuelve «a medias».** Terminarlo borra su
  estado, y un borrado no deja rastro: el aparato donde se había empezado le
  ganaba a la nube vacía y lo volvía a subir. El estado lleva ahora `guardado`,
  y si hay un resultado posterior, esa prueba ya se terminó y se descarta.
- Las preferencias del aparato (tema, modo adaptado) **no** se sincronizan a
  propósito: son de dónde se está mirando, no de quién mira.
- Sin sesión o sin red, la página funciona igual con su `localStorage` y sube al
  volver.

## Logros y racha de días

`logros.html` (tarjeta "🏅 Logros" en el panel, grupo "Jugar y competir", junto a
"Racha táctica") es la gamificación de Entrenamiento: una racha de días
consecutivos y un catálogo de medallas, de sencillas a avanzadas, calculadas
siempre a partir de `training_progress` — nunca de una tabla de "logros
desbloqueados", para que un logro no pueda quedar a medias por un guardado que
falló.

- **Un día cuenta si tiene 5 o más ejercicios de CUALQUIER tipo**, agrupados
  por fecha de **Costa Rica** (no UTC: quien entrena a las 11 p.m. no puede
  perder el día por el huso horario del servidor). Lo calcula
  `public.progreso_dias_y_racha(alumno uuid default auth.uid())`
  —`SECURITY INVOKER`, mismo criterio que las funciones de informes: quién
  puede pedir la racha de quién lo decide la RLS de `training_progress`, así
  que ya sirve tanto para que un alumno pida la suya como para que un
  profesor pida la de uno de sus alumnos el día que se necesite en Informes—
  con la técnica de siempre para islas de días consecutivos (gaps and
  islands: `dia - row_number()` agrupa un tramo sin huecos en un solo valor).
  Devuelve `dias_activos`, `racha_actual`, `racha_record`, `total_ejercicios`,
  `tipos_distintos`, `hoy_ejercicios`, `primer_dia` y `por_actividad` (un
  `jsonb` con cuántas filas hay de cada actividad).
- **La racha actual se corta si el último día activo no fue hoy ni ayer.**
  Con datos de mentira se comprobó el caso de siempre —una racha vieja que no
  sigue hasta hoy no cuenta como "actual" pero sí sigue contando para el
  récord— y el caso vacío (nadie ha practicado nunca) sin que la función
  truene.
- **Los logros usan `racha_record`, no `racha_actual`.** Un logro ya ganado no
  se puede perder porque un día se rompió la racha — "lo hecho, hecho está",
  el mismo criterio que ya usa `js/progreso-usuario.js` para los ejercicios
  resueltos.
- **El catálogo (`js/logros-catalogo.js`) es puro**: cada logro es
  `{ id, categoria, nivel, meta, valor(stats) }`, y `conEstado(stats)` no
  guarda nada — recalcula conseguido/progreso cada vez a partir de los
  números de la función de arriba. Van de sencillos a avanzados en cuatro
  niveles (bronce, plata, oro, diamante): racha de días, ejercicios totales,
  variedad de tipos practicados, días de práctica acumulados (no hace falta
  que sean seguidos) y metas por cada tipo de ejercicio.
- **`ACTIVIDADES_ALCANZABLES` es 18, no 20** (era 13 hasta que llegó
  `finales`, 15 con `tipos` y 18 con Precisión, el Sonar y Batalla naval;
  nadie tenía ninguna de esas cifras, así que nadie perdió la medalla). El
  CHECK de `training_progress` tiene 20 actividades, pero `desafios` está
  declarada sin ningún uso real
  (`entreno/desafios.html` registra como `'practicar'`) y `preparacion` solo
  la tiene quien recibió un plan contra un rival: pedir las 20 para el
  logro "Las probaste todas" habría dejado un logro que nadie puede conseguir
  nunca, y eso no da ningún error —se queda gris para siempre sin que nadie
  sepa por qué—.
- **Cuatro actividades se sumaron al CHECK para que "cualquier tipo" sea
  cierto de verdad**: `aperturas`, `confites`, `ilumina` y `visualizacion`
  vivían solo en `localStorage` (con un comentario explícito en
  `entreno/aperturas.html` de por qué no escribían en `training_progress`) y
  no contaban para nada del lado del servidor. Ahora sus páginas cargan
  `js/entreno-progress.js` y llaman a `EntrenoProgress.log(...)` al terminar
  una ronda, una línea, un nivel o un ejercicio — mismo patrón que ya usaban
  Mates, 4×4, Aprende, etc. `finales100` (Los 100 finales) y el `slug` de
  `js/curso-partidas.js` quedaron fuera en esta tanda; `finales100` entró
  después (ver «La práctica de los cursos de finales cuenta»).
- **`logros.html` exige sesión** (mismo patrón que `entreno/estudio.html`:
  gate → `requireLoginThenGate()` → `unlock()`), porque la racha es de la
  cuenta, no del aparato. Pide `progreso_dias_y_racha` por RPC — nunca baja
  `training_progress` entera — y pinta la racha, la barra de "hoy" (cuántos
  de los 5 ya lleva) y la grilla de medallas agrupada por categoría, con el
  conteo conseguidas/total en cada encabezado.
- `clases.html` suma una tarjeta chica de racha (`loadRachaWidget()`, junto a
  la de "Racha táctica — récord de la clase") que solo pinta un resumen de una
  línea — la cuenta la sigue haciendo la misma función.
- **Al tocar cualquiera de estas piezas, correr `node
  herramientas/verificar-logros.js`** (con el sitio en localhost:8777,
  playwright y `npm install chess.js@0.10.3`). Con un resultado de mentira ya
  calculado (no vuelve a sumar días: eso ya se probó con SQL de verdad,
  impersonando el rol del alumno, contra el proyecto de Supabase) comprueba
  que la racha, la barra de "hoy" y cada medalla salgan EXACTAMENTE como las
  calcula `js/logros-catalogo.js` para esos mismos números —comparando contra
  el catálogo cargado de verdad en el navegador, no reimplementando sus
  metas—, que sin sesión mande a iniciar sesión, que un RPC vacío se vea en
  cero sin romper la página, y que las cuatro páginas nuevas (Confites,
  Ilumina el tablero, Aperturas y celadas, Visualización) manden de verdad su
  fila a `training_progress` al terminar un ejercicio.

## Los trofeos de la clase

En la clase en vivo (`sesion.html`) el profesor pregunta «¿qué jugarías?» y
marca ✅ o ❌ cada respuesta. **Cada respuesta marcada ✅ es un trofeo**, y los
trofeos se acumulan de clase en clase: el alumno ve su total en la clase
(`#mis-trofeos`, en su panel) y en `logros.html` («Tus trofeos de clase» y la
categoría de medallas «Trofeos de clase»: 1, 10, 25, 50, 100 y 250).

- **El total es respuestas correctas + ajustes del profesor.** Lo calcula
  `public.trofeos_de(p_alumno default auth.uid())` y devuelve `por_clase`,
  `ajustes` y `total` (nunca menos de cero).
- **Las respuestas correctas no se guardan como trofeos: se cuentan**
  (`question_answers.is_correct = true`). Si el profesor cambia un ✅ por ❌, el
  trofeo se va solo; una tabla de «trofeos ganados» habría quedado con uno de
  más sin que nada fallara.
- **El profesor ajusta a mano** con el botón 🏆 del renglón del alumno
  (en «Alumnos conectados»): +1, −1, +5 o una cantidad escrita (−100 a 100) con un
  motivo que el alumno ve. Cada ajuste es una fila de `trofeos_ajustes` (quién,
  cuánto, por qué y cuándo), no un total sobreescrito: así el alumno ve de
  dónde salió cada trofeo y un ajuste no borra otro.
- **Quién ajusta lo decide la base**: `ajustar_trofeos()` (`SECURITY DEFINER`)
  exige `soy_profesor_de(alumno)` o `soy_admin()`, nunca a uno mismo, y rechaza
  quitar más de lo que tiene (con un candado por alumno para que dos profesores
  a la vez no lo dejen en negativo). La tabla no tiene política de escritura.
  La leen el alumno, sus profesores (el conjunto `interno.alumnos_de()` armado
  una vez), quien administra y quien supervisa a sus profesores.
- **`trofeos_de()` es `SECURITY DEFINER` a propósito**: con INVOKER cada
  profesor contaría solo las respuestas a SUS preguntas (la RLS de
  `question_answers`) y un alumno con dos profesores tendría dos totales. El
  permiso se pregunta explícito, con el `coalesce(..., false)` de siempre.
- **El contador del alumno se vuelve a pedir** cada vez que Realtime avisa que
  le calificaron una respuesta (de cualquier pregunta, no solo la abierta) o
  que el profesor le agregó un ajuste (`trofeos_ajustes` está en la
  publicación de Realtime). Nunca se suma en el navegador.
- El módulo es `js/trofeos.js` (una sola copia para la clase y Logros). En
  Logros, `Logros.cargar()` pide `trofeos_de` a la par de la racha; si falla,
  cuenta cero y no tumba la racha.
- Se probó con SQL de verdad, impersonando roles dentro de una transacción que
  se deshace: el profesor ve 9 y con +3 queda en 12; quitar 100 se rechaza; la
  alumna ve lo suyo y no puede sumarse ni insertar directo; alguien ajeno no ve
  ni el total ni las filas; sin `auth.uid()` se rechaza.
- **Verificadores**: `verificar-trofeos.js` (el panel del profesor manda el
  alumno y la cantidad correctos, lo que no se puede no llega a la base, y la
  alumna ve su total crecer y bajar solo) y `verificar-logros.js` (el total, su
  desglose, los ajustes escapados y las medallas). El doble de
  `verificar-clase-registrada.js` cuenta los trofeos igual que la base.

## Las insignias de la clase

Además de los trofeos, el profesor premia **a mano** lo que no da trofeo: un
buen comentario, un ejercicio de la pizarra bien resuelto, la actitud. Son
insignias, y se dan desde el mismo botón 🏆 del renglón del alumno en
`sesion.html` («Dar una insignia»), con un motivo opcional que ven el alumno y
su casa. Hay seis: ⭐ Estrella de buen estudiante, 💡 Buena respuesta,
💬 Buen comentario, 💪 Gran esfuerzo, 🤝 Buen compañerismo y 🎨 Idea creativa.

- **El catálogo vive en la base** (`insignias_tipos`), no en el código: lo
  leen la clase, Logros, Informes y el correo a la casa, que es una Edge
  Function en TypeScript y no puede importar un módulo del navegador. Dos
  copias del nombre de una insignia se irían separando. Para agregar una, se
  inserta una fila: la página y el correo la toman solos.
- **Cada insignia es una fila** de `insignias` (quién, cuál, por qué, cuándo,
  quién la dio). Las da `otorgar_insignia()` —su profesor o quien administra,
  nunca a uno mismo— y las quita `quitar_insignia()` —solo quien la dio, o
  quien administra—, que es el «Deshacer» que aparece al lado del aviso por si
  el toque fue equivocado. Ninguna de las dos tablas tiene política de
  escritura. La lectura sigue la misma RLS que `trofeos_ajustes`.
- **`premios_de_alumno(alumno, desde, hasta)` cuenta todo junto**: trofeos del
  periodo y del total, insignias por tipo (periodo y total) y las últimas cinco
  del periodo con su motivo. Es `SECURITY DEFINER` con el criterio de
  `resumen_tareas_examenes()`: `auth.uid()` nulo es la tanda de `pg_cron` (a
  `anon` se le revoca el `execute`), así la tanda, la vista previa del
  profesor y el propio alumno ven exactamente lo mismo.
- **Llega al correo a la casa** porque `informe_de_alumno()` termina en
  `|| public.premios_de_alumno(p_alumno, p_desde, p_hasta)`, igual que las
  tareas. La migración no copió la función a mano: la reescribió a partir de
  `pg_get_functiondef()` cambiando solo la cola, y falla si la cola ya no es la
  esperada. En el correo sale el bloque **«🏆 Sus premios en clase»**: trofeos
  del periodo («4 trofeos esta semana»), cada insignia del periodo con cuántas
  veces, los motivos rotulados «De su profe» (escapados: los escribe una
  persona) y cuántos lleva en total. **Sin premios en el periodo, no aparece**
  —la misma regla que el plan—.
- **En la clase**, el alumno ve sus insignias bajo su contador de trofeos, y
  cuando le dan una se le celebra con el aviso flotante en dorado («⭐ ¡Tu profe
  te dio la insignia…!»), por Realtime (`insignias` está en la publicación).
- **En Logros**, una categoría de medallas «Insignias de clase» (1, 5, 15, 30 y
  60) y la lista de las suyas en «Tus trofeos e insignias de clase».
  `Logros.cargar()` pide `premios_de_alumno` en vez de `trofeos_de`.
- **En Informes**, el bloque «🏆 Trofeos e insignias» del informe de cada alumno
  (lo ven el profesor, quien administra, quien supervisa y el propio alumno).
- Probado con SQL de verdad impersonando roles: el profesor da dos, un tipo
  inventado se rechaza, otro profesor del mismo alumno no puede quitar la que
  no dio, el alumno ve las suyas pero no puede darse ni quitar, alguien ajeno
  no ve nada, y la tanda (sin `auth.uid()`) recibe los premios dentro de
  `informe_de_alumno()`.
- **Verificadores**: `verificar-trofeos.js` (dar, el motivo, deshacer, la
  celebración del alumno), `verificar-logros.js` (medallas y lista, motivo
  escapado), `verificar-informes.js` (el bloque del informe) y
  `verificar-informe-casa.js` (el bloque del correo: cuenta el periodo y no el
  total, «1 vez», motivo escapado, y que no salga vacío). Cambiar
  `informe-html.ts` pide desplegar `informes-encargados` (ver «Los informes
  que llegan a la casa»).

## Lo que cuenta como acierto en los ejercicios

Cada página de ejercicios tenía su propia copia del tablero y de la regla de
qué es un acierto, y las copias se habían separado. Nada de esto daba ningún
error: la página se veía perfecta y le decía al alumno otra cosa.
`node herramientas/verificar-todo.js entreno-arreglos` lo comprueba en un
navegador, página por página.

- **Cualquier jugada que dé mate es correcta**, en Temas, Racha, Mates y
  Practicar. Los bancos guardan UNA solución y a veces hay dos mates (en
  `mate1-0071`, Ch6# y Ce5#; en la serie «beso» de Practicar, Dh7# y Da8#).
  Mates y Practicar decían «no lleva al mate» de un mate.
- **El tablero se mira desde el bando que juega**, también en Mates: casi 400
  de sus posiciones de mate en 2 y en 3 son con negras.
- **«Ver solución» no es un acierto.** En Practicar y Desafíos no suma a la
  racha ni se festeja con «¡Correcto!» (Practicar dejaba la racha en 1).
- **Las estrellas de una posición cuentan pistas Y errores**
  (`EntrenoProgress.estrellasDeLaRonda`, una sola copia para Practicar y
  Desafíos): antes solo las pistas, y probar jugada tras jugada hasta acertar
  daba tres estrellas. Es la misma regla de Aperturas: la nota sale de lo que
  de verdad pasó.
- **En Visualización, un ejercicio con pista o con error no queda resuelto** y
  vuelve a salir; tampoco se registra en `training_progress`. Antes se marcaba
  igual y el contador (y lo que ve el profesor) contaba como dominado uno
  sacado con la pista.
- **En Visualización, «R» se lee como la línea lo pide.** Es el rey en
  castellano y la torre en inglés, y `ChessMoveParser` prueba primero el
  inglés: con rey y torre que llegan a la misma casilla, «Rd2» movía la torre y
  le cortaba la racha a quien había calculado bien. Como la página sabe qué
  jugada espera, prueba las dos lecturas y gana la esperada
  (`jugadaDeLaLinea`); si ninguna lo es, queda la de siempre.
- **El quiz de Aprender («¿mate o ahogado?») no deja reintentar la misma
  posición**: con dos botones, eso era regalar la respuesta. Una respuesta mal
  explica por qué y pasa a la siguiente; la lección solo se completa sin
  fallar ninguna.

## Cada ejercicio a la altura del alumno

`node herramientas/verificar-todo.js entreno-nivel` lo comprueba en un
navegador. Si esto se rompe, no da ningún error: la página sigue andando, solo
que el alumno de 1800 vuelve a empezar en los de 1000.

- **Ejercicios por tema arranca cada tema cerca del nivel del alumno.** Los
  temas de Lichess vienen ordenados por rating (ataque doble va de 1047 a
  1978) y la página arrancaba siempre en el primero sin resolver. Ahora
  arranca en el primero sin resolver cuyo rating llegue a «desde», que se
  elige en un selector debajo de la barra de progreso. «Desde» sale, en este
  orden:
  1. `?desde=<rating>` en el enlace.
  2. Lo que eligió el alumno (`entreno_temas_desde`, del aparato).
  3. Su nivel **menos 300**: el Elo del último diagnóstico (el resultado
     guardado trae `elo`) o, si no hay, el de su perfil. Se resta porque el
     rating de un ejercicio de Lichess no es un Elo FIDE: a igual fuerza, el de
     Lichess suele ser más alto, así que quedarse corto es lo seguro.
  4. Desde el más fácil.
  Los temas sin rating (táctica de la casa) no muestran el selector y no se
  filtran.
- **«Saltar» y el paso al siguiente van al próximo SIN resolver** a esa
  altura. Antes avanzaban uno y caían en ejercicios ya hechos. Las tareas
  («resuelve 10 de ataque doble») siguen dando ejercicios nuevos: solo se
  saltan los que ya estaban resueltos.
- **Cada ejercicio de Temas y de Mates guarda cómo salió**:
  `EntrenoProgress.comoSalio()` pone `limpio`, `con_error` y `con_pista` en el
  `detail` de `training_progress`. Va en el detalle y no como actividad nueva,
  así que el CHECK de la tabla no cambia y las filas viejas siguen valiendo.
  Es lo que falta para medir la precisión por tema, que antes no se podía:
  solo quedaba «resuelto».
- **La Racha táctica sube la dificultad con la racha.** Antes sorteaba entre
  los 4446 ejercicios (de 399 a 1791) sin mirar el rating: a uno le tocaba un
  1791 de entrada y a otro un 399 en el trigésimo, con el mismo reloj, y el
  récord del grupo comparaba rachas que no se parecían. Ahora el ejercicio
  número n se sortea cerca de `500 + 60 × n` (la ventana se abre si arriba
  quedan pocos), y dentro de una racha no se repite ninguno. Los récords
  guardados antes de este cambio son de la racha al azar.

## Cinco arreglos cortos: orden, sesión, plan, fichas y niveles

`verificar-entreno-arreglos.js` (en un navegador), `verificar-precision-posicional.js`,
`verificar-tipos-pagina.js` y `verificar-plan-recursos.js` los comprueban.

- **Visualización va de fácil a difícil dentro de cada nivel.** Los
  ejercicios iban por id, o sea al azar: el Nivel 1 mezclaba uno de 600 con
  otro de 2000. Ahora van por rating (los que no traen rating, al final; el id
  desempata para que el orden no cambie). Lo resuelto se guarda por id, así
  que reordenar no pierde nada.
- **Racha táctica sin sesión manda al login con `?next=`**, como las demás
  páginas: antes mandaba a `login.html` a secas y, al volver a entrar, el
  alumno quedaba en el panel y no en la racha. Pasa cuando el token sigue
  guardado pero la sesión venció (la guardia deja pasar y `getSession()` da
  nada); el doble lo imita con `tablas.sesion = null`.
- **El plan del diagnóstico manda también a Tipos de entrenamiento y a
  Precisión posicional**, que no aparecían en ningún área. Cada enlace va a
  `entreno/tipos.html#<tipo>` (abre la ficha de ese tipo) y
  `verificar-plan-recursos.js` comprueba que el tipo exista en
  `js/tipos-catalogo.js`: un ancla vieja abriría la lista general sin avisar.
- **En Precisión posicional, «a reforzar» enlaza las fichas de Estudio** de
  cada área (`fichas` en `js/precision-posicional-criterio.js`; el verificador
  comprueba que existan y que el título sea el de la ficha). Antes el consejo
  era una frase y ningún lugar adonde ir.
- **Dos rondas cortas seguidas no repiten la misma idea espejada.** El banco
  son 24 ideas con tres espejos cada una (`pp_x_01`, `_h`, `_v`, `_hv`): con
  tres ideas por área, la ronda siguiente sacaba la misma posición dada
  vuelta una de cada tres veces por área, y se contestaba de memoria.
  `PRUEBA.armar(1, evitar)` deja fuera las ideas (`PRUEBA.idea(id)`) de la
  ronda anterior, que sale de `detalle.items` del último resultado guardado;
  si en un área no queda otra, se usa igual.
- **Tipos: al resolver el último ejercicio que faltaba de un nivel, la página
  dice «¡Nivel completo!»** y ofrece el siguiente; en el último ejercicio,
  «Siguiente» dice adónde va («Nivel 2 →» o «Volver a los niveles») y lleva
  ahí. Antes volvía a la lista sin decir nada. Solo festeja el cambio (el
  nivel estaba incompleto y ahora no): repasar un nivel ya completo no vuelve
  a festejar.

## Entender el error y ver la línea (Temas y Mates)

`verificar-entreno-arreglos.js` («La refutación del error» y «Mates: Siguiente
y Ver la línea») lo comprueba en un navegador.

- **Al fallar, la página dice qué contesta el rival**, pero solo lo que
  chess.js puede afirmar sin motor (`EjercicioTablero.refutacion()`): un mate
  en una, o una pieza (caballo o más) que el rival se come y que ninguna pieza
  propia puede volver a comer en esa casilla. El texto dice exactamente eso
  («y ninguna pieza tuya puede volver a comer en d4»), no «pierdes la dama»:
  eso sería una promesa que sin motor no se puede hacer (la regla de
  CLAUDE.md: lo que promete un resultado se comprueba con motor). Si no hay nada así, el aviso queda como antes. Las jugadas van
  en castellano (`jugadaEs`: Cf3, Dxh7#), como las escribe el alumno.
- **Resuelto el ejercicio, ya no salta solo al siguiente.** Antes pasaba al
  segundo y no daba tiempo de mirar qué se había jugado. Ahora
  `EjercicioTablero.fin()` pone «Siguiente ejercicio →» (con el foco, salvo
  que el alumno esté escribiendo en el cuadro de comandos, donde «siguiente»
  hace lo mismo) y «Ver la línea», que abre la línea jugada en
  `js/visor-linea.js`: el mismo visor de Estudio y de la preparación de
  rivales, recorrible con ⏮ ◀ ▶ ⏭, teclado, lector de pantalla y escribiendo.
- Para eso el visor aprendió a **arrancar desde una posición** (`desde`, una
  FEN; la numeración sigue la de la FEN, «24… Txe1» si empiezan las negras) y
  a **mirarse desde las negras** (`orientacion: "b"`), como el ejercicio.
- La línea que se muestra es la que **se jugó** (`game.history()`), no la
  guardada: si el alumno dio otro mate, se ve el suyo.
- Los verificadores que daban por hecho el salto (`entreno-nivel`,
  `entreno-repaso`) ahora aprietan «Siguiente».

## Mates: de dónde salen y por qué no tienen dificultad

Los 2455 mates (`entreno/data/mates.json`) salen del libro de László Polgár
*Chess: 5334 Problems, Combinations, and Games* (#59): posiciones recortadas
(casi todas con «0 1» en la FEN), no de partidas. Por eso **no tienen rating**
y no se le puede sacar de la base de Lichess: se probó buscando cada uno en la
tabla «Ejercicios Lichess» (107 mil ejercicios de mate) aplicando la primera
jugada de cada ejercicio de Lichess y comparando el tablero (una huella md5,
para no bajar la tabla), y ninguno coincide; con los de Temas, 8 de 2455. La
dificultad no se pone a ojo, así que Mates sigue el orden del libro (barajado
por bloques para cada alumno, ver «Mates barajados…») hasta que haya intentos
suficientes para medirla (ver la sección siguiente).

## Calibrar los Mates con los intentos reales

La herramienta está lista, pero **todavía no alcanza**. A fines de septiembre
de 2026 había 77 intentos con `limpio`, de 4 alumnos, y ningún mate con más de
dos. Cuando alcance, la página se ordena sola.

- **Qué se mide**: cada mate que un alumno resuelve por primera vez queda en
  `training_progress` (`activity = 'mates'`) con `limpio` (sin error y sin
  pista, desde #491). `herramientas/lib/mates-ajuste.js` le pone a cada mate
  su dificultad en puntos Elo con el modelo del diagnóstico
  (`PlanEntrenamiento.probabilidad`, sin azar). El ajuste va por turnos, igual
  que `diagnostico-calibrar.js`:
  1. el centro de cada categoría, con todos sus intentos;
  2. cada mate, desde ese centro (± 300);
  3. cada alumno, desde su medida: la fuerza del último diagnóstico (± su
     error), si no el Elo del perfil (± el margen de su origen), y si no
     1200 ± 500.
  Esa medida es lo que ancla la escala al Elo.
- **Cómo se corre**: la consulta para exportar está en la cabecera de
  `herramientas/mates-calibrar.js`. El archivo exportado va FUERA del
  repositorio (son datos de personas; el script se niega si está adentro).
  Después: `node herramientas/mates-calibrar.js intentos.json`. Escribe
  `entreno/data/mates-dificultad.json`, que es SOLO agregado: cuántos
  intentos y alumnos, el centro de cada categoría y la dificultad de cada mate
  con **8 intentos o más**. No se edita a mano.
- **La página** (`js/mates-dificultad.js`) ordena una categoría de fácil a
  difícil **solo si tiene calibrados el 80 % de sus mates**, y entonces la
  barra dice «dificultad ≈1350». Con menos, casi todos irían a su centro y el
  orden lo pondría el puñado medido: la categoría va barajada por bloques con
  la semilla del alumno (ver «Mates barajados, «Tu semana»…»). Sin el
  archivo, la página funciona igual. El avance es por id, así que reordenar no pierde
  nada de lo resuelto.
- **Por qué 8**: `verificar-mates-calibrar.js` inventa alumnos y mates de
  dificultad CONOCIDA (con los centros lejos de la previa) y comprueba que el
  ajuste la recupere:
  - con unos 30 intentos por mate, Spearman 0,97 y error medio de ~80 puntos;
  - con unos 8, el orden dentro de cada categoría ya sigue al de verdad
    (~0,8).
  El mismo verificador revisa que lo publicado no traiga nada de ningún alumno.
  `verificar-mates-dificultad.js` prueba la página: el archivo de hoy, una
  categoría calibrada entera, el 79 % y sin archivo.
- **Sesgo conocido**: solo se registra el mate resuelto, así que el que se
  abandona no cuenta como fallo. Por eso la medida es «limpio o no», no
  «resuelto o no».
- Conviene volver a correrlo cada unos miles de intentos nuevos. Cada vez
  parte de la previa, no del resultado anterior, así que los mismos datos no
  se cuentan dos veces.

## Finales contra la máquina, en Informes

La revisión de la página no encontró nada mal en el juego (la meta la decide
cómo termina la partida y, sin motor, no se regala nada), pero **el profesor no
veía los finales**: la página escribe una fila por final logrado y ninguna
función de Informes la contaba. `informes_entreno_modulos()` suma la columna
`finales` (finales distintos logrados; migración `20260929051137`, que borra y
vuelve a crear la función porque cambia lo que devuelve, con sus permisos), e
Informes la muestra en una tarjeta de segunda fila (ahora son quince). Lo
prueba `verificar-informes.js`.

## Tipos cuenta: racha, logros, Cómo viene y tareas

Tipos de entrenamiento guardaba sus estrellas solo en el progreso de la cuenta:
1211 ejercicios que no sumaban a la meta del día ni a la racha, no daban
logros, no salían en «Cómo viene» y no se podían pedir como tarea. Todo eso lee
`training_progress`, así que alcanzó con escribir ahí (migración
`20260929052521`: `'tipos'` en el CHECK de actividades).

- **Cada ejercicio va UNA vez**, la primera que se resuelve (con una estrella o
  más): `detail.puzzle_id = "tipo:id"`, `category` = el tipo, `nivel` y
  `estrellas`. Lo ya registrado se anota en `tipos_registrados_v1` (viaja con
  la cuenta, `unionObjeto`) y NO se deduce de las estrellas: lo resuelto antes
  de que existiera el registro se registra la próxima vez que se resuelve. Si
  se mirara «¿ya tenía estrellas?», eso quedaría fuera para siempre, y una
  tarea de «10 de Detective» podía quedar imposible para quien ya lo había
  hecho todo.
- **Tareas**: «Tipos de entrenamiento» está en `js/material-plataforma.js`, con
  cantidad y minutos, y un recorte por tipo (`metas.json` → `tipos`, que arma
  `herramientas/metas-indice.py` leyendo `tipos.json` y el catálogo). El
  recorte es `detail.category`, que `tareas_con_avance()` ya filtraba: no hubo
  que tocarla. El enlace abre la ficha del tipo (`tipos.html#detective`).
- **Logros**: «De todos los tipos» (20 ejercicios), y las actividades
  alcanzables para «Las probaste todas» pasan de 14 a 15. Nadie tenía 14 (el
  máximo era 12): nadie pierde la medalla.
- `verificar-tareas.js` comprueba ahora que **toda herramienta que ofrece
  cantidad cuente una actividad que el CHECK acepta** (sin eso, la barra se
  queda en cero y nada avisa), y que los recortes de Tipos coincidan con
  `tipos.json`. `verificar-tipos-pagina.js` prueba el registro: una vez por
  ejercicio, y también lo resuelto antes.
- Precisión posicional, el Sonar y la Batalla naval se sumaron después (ver
  la sección siguiente).

## Precisión, el Sonar y Batalla naval también cuentan

Las tres guardaban su resultado solo en el progreso de la cuenta, así que
quedaban fuera de la meta del día, la racha, los logros, «Cómo viene» y las
tareas por cantidad. Ahora cada tanda o partida terminada escribe UNA fila en
`training_progress` (migración `20260929060654`: `'precision-posicional'`,
`'sonar'` y `'batalla-naval'` en el CHECK, el mismo nombre que ya usaba su
registro de tiempo).

- **Sin `puzzle_id` ni `nivel_id`, a propósito**: la tanda de Precisión se
  sortea y el tesoro y la flota se esconden al azar, así que cada partida es
  nueva. `tareas_con_avance()` cuenta distintos por esas claves y, sin ellas,
  cae en `tp.id`: «5 partidas de Sonar» son cinco partidas jugadas, no cinco
  niveles. El detalle lleva lo que sirve para leerla: `nivel`, `jugadas` o
  `disparos`, `estrellas` y `con_pista`; el duelo de Batalla naval,
  `duelo: true` y `gano` (se registra se gane o se pierda: se jugó); la
  tanda de Precisión, `modo`, `cantidad`, `aciertos` y `porcentaje`.
- **Tareas**: las tres están en `js/material-plataforma.js` con cantidad y
  minutos (antes no estaban de ninguna forma).
- **Logros**: «Las probaste todas» pasa de 15 a 18 actividades alcanzables
  (el máximo de cualquier alumno seguía en 12).
- `verificar-tareas.js` leía el CHECK con `'([a-z0-9_]+)'`, **sin el guion**:
  habría dado por rechazadas `precision-posicional` y `batalla-naval`. Ahora
  lo lee con guion. `verificar-sonar.js`, `verificar-batalla-naval.js` (también
  el duelo) y `verificar-precision-posicional-pagina.js` prueban que se
  registra una sola fila, con su detalle.

## Repasar fallados también en Visualización y Practicar; y el hub propone más

- **Visualización y Practicar tienen la cola de «Repasar fallados»**
  (`js/repaso-fallados.js`, la misma de Temas y Mates, con sus claves
  `entreno_visualizacion_repaso_v1` y `entreno_practicas_repaso_v1`, que viajan
  con la cuenta). Lo que sale con error o con pista entra; lo repasado limpio
  se reprograma y, a los tres limpios seguidos, sale.
  - En **Visualización** el repaso es un «nivel» más (`__repaso`) con los de
    hoy. Repasado limpio, cuenta como resuelto: con error no había contado.
  - En **Practicar** la cola es **por ronda** (`serie:número`), no por serie:
    lo que costó es una posición, no las cinco. El repaso es una serie armada
    con esas rondas; cada una recuerda su serie (`_serie`), que es la que dice
    qué motivo vale (`js/motivos-tacticos.js`): en el repaso de un descubierto
    sigue valiendo cualquier salto que descubra el jaque. «Ver solución» cuenta
    como pista. El repaso no guarda estrellas ni se registra como serie.
  - Las dos abren la cola con `?repaso=1`, el enlace del hub.
- **El «Hoy te toca» propone también**: los repasos de Visualización y de
  Practicar, y **seguir el nivel de Tipos que quedó a medias**
  («Seguir con El Detective, nivel 2 (7 de 20)» → `tipos.html#detective/2`).
  Eso último lo anota la página de Tipos en `tipos_ultimo_v1` (tipo, nivel,
  cuántos lleva y cuántos son) al abrir un nivel y al resolver; viaja con la
  cuenta con `ultimaEscritura` (gana el aparato donde se jugó más tarde). Un
  nivel completo no se propone. Siguen siendo tres cosas como mucho.
- **Informes dice las casillas que más le cuestan en Coordenadas**
  («b6 · g3 — falló 9 de 10, 4 de 7»). `informes_entreno_modulos()` manda los
  contadores de las casillas falladas dos veces o más (`coord_casillas`,
  migración `20260929054914`) y el orden lo pone `js/coordenadas-casillas.js`,
  el mismo de la página: la fórmula no se escribe dos veces.
- Lo prueban `verificar-entreno-repaso.js` (las dos colas, el motivo en el
  repaso de Practicar, el hub), `verificar-tipos-pagina.js` (que se anote el
  nivel) y `verificar-informes.js` (la tarjeta).

## El hub en el celular

Se miró la tarjeta «Hoy te toca» a 390 px, en claro y en oscuro, con todo lo
que se le fue sumando (la meta, el resumen del día, «Tu semana», el aviso de
racha y la lista). Tenía tres párrafos y un botón grande antes de lo que toca
hacer, y la lista quedaba abajo de la pantalla.

- **El botón de avisos va DESPUÉS de la lista.** Es una oferta de una vez; lo
  que se viene a buscar es la lista.
- **El resumen del día ya no repite el total**: la meta, justo arriba, dice
  «7 ejercicios». Queda «Hoy: Mates 4, Tipos de entrenamiento 2, Memoria 1 ·
  5 de 7 sin error ni pista · Para mañana: 3 repasos.»
- `verificar-entreno-repaso.js` mide en la pantalla, a 390 px, que el primer
  enlace de la lista quede arriba del botón de avisos y que no haya
  desplazamiento de lado.

## Mates barajados, «Tu semana», los tipos completos y «Salva las tablas» en el plan

- **Mates se baraja por bloques de 50** mientras una categoría no tiene su
  dificultad medida (`MatesDificultad.orden`/`barajar`).
  - Antes todos los alumnos hacían los mismos primeros mates del libro, y la
    calibración (ver «Calibrar los Mates con los intentos reales») juntaba
    muchos intentos de pocos mates y ninguno del resto.
  - La semilla es el id del alumno: cada uno ve siempre el mismo orden, en
    cualquier aparato. Por bloques, el orden grueso del libro se mantiene.
  - El avance es por id, así que no se pierde nada.
  - Con la categoría calibrada, manda la dificultad y no se baraja; sin
    sesión, queda el orden del libro.
- **«Tu semana» en el hub**, debajo del resumen del día: «Esta semana: 48
  ejercicios (la anterior, 31) · 70 % sin error ni pista (la anterior,
  62 %)».
  - Son los últimos 7 días contra los 7 anteriores, en hora de Costa Rica,
    calculados por `entreno_mi_semana()` (migración `20260929185756`).
  - Si la semana anterior no entrenó, lo dice. Sin nada en las dos semanas,
    no se pinta.
- **Logros por tipos completos**: «Tipo dominado» (1), «Cinco tipos
  dominados» y «Diez tipos dominados».
  - Un tipo completo tiene todos sus ejercicios con una estrella o más.
  - Lo anota `entreno/tipos.html` en `tipos_completos_v1`, que viaja con la
    cuenta (`unionObjeto`). Esa página es la única que tiene los ejercicios
    de verdad; contarlo desde Logros pediría bajarse `tipos.json` entero.
  - `js/logros.js` lo lee de `training_state`, dentro de un `.then`, así que
    si falla cuenta cero y no tumba la racha.
  - La ficha del tipo dice «completo 🏅».
  - «Tus propios errores» no cuenta: sus ejercicios crecen con las partidas.
- **«Salva las tablas»** (tipo 19) entra al plan del diagnóstico, en el área
  de finales, con su avance contado (`tipo:tablas`).
- Lo prueban:
  - `verificar-mates-dificultad.js`: el barajado es el mismo para la misma
    semilla, cambia con otra, respeta los bloques y cede ante la
    dificultad;
  - `verificar-entreno-repaso.js`: «Tu semana»;
  - `verificar-tipos-pagina.js`: completo sí; con un ejercicio sin resolver,
    no;
  - `verificar-logros.js`: los logros de tipos completos;
  - `verificar-plan-recursos.js`.

## El tipo más flojo en el hub, y el plan del diagnóstico con lo nuevo

- **«Hoy te toca» propone el Tipo de entrenamiento más flojo** si queda por
  debajo del 70 % (`TipoFlojo.FLOJO`, el mismo corte del tema). Por
  ejemplo: «Tu tipo de entrenamiento más flojo, «La balanza»: tres estrellas
  en 3 de 8» → `tipos.html#balanza`. Es la misma cuenta de Informes
  (`informes_tipo_mas_flojo()`, ver «El tipo de entrenamiento más flojo» en
  informes.md); el hub se queda con la fila del alumno de la sesión.
- **El plan del diagnóstico propone lo nuevo**:
  - Táctica: Aguanta.
  - Estrategia: Remata la ventaja y Elige a tiempo.
  - Cálculo: Memoria y el Sonar.

  Van al final de cada área, así que el primer paso de cada semana no
  cambia.
- **Y cuenta lo que se hace ahí.** Antes, los enlaces del plan a un tipo
  (`tipos.html#balanza`) decían «(todavía nada)» para siempre por dos
  razones:
  - `claveDeAvance` no entendía el `#`;
  - `avance_del_plan()` juntaba todo Tipos en `actividad:tipos`.

  Ahora cada tipo es `tipo:<id>` (migración `20260929174938`). Pasaba lo
  mismo con Concentración, y también con Memoria, Precisión, el Sonar y
  Batalla naval, que ya registran: `ACTIVIDAD_DE_PAGINA` las conoce.
- `verificar-plan-recursos.js` comprueba ahora que **todo recurso del plan
  que lleva a una página que registra pida la clave de lo que registra**.
  Qué páginas registran lo dice Tareas: las herramientas con meta de
  cantidad. Rota a propósito (sin Concentración, sin el `#`), salta.

## Memoria cuenta, y el resumen del día en el hub

- **Memoria** (`entreno/memoria.html`, #560) no registraba nada: ni en
  `training_progress` ni el tiempo (le faltaba `js/tiempo-plataforma.js`,
  aunque Informes ya tenía su sección). Ahora:
  - cada posición reconstruida escribe una fila `memoria`, con `piezas`,
    `segundos`, `aciertos`, `total`, `estrellas` y `limpio` (sin un error).
    Va sin `puzzle_id`: la posición se sortea, así que en una tarea cada
    ronda cuenta. La migración `20260929171852` suma `'memoria'` al CHECK;
  - se puede pedir en Tareas, por cantidad o por minutos;
  - tiene dos logros: «Retratista» (10 posiciones) y «Memoria fotográfica»
    (una de 12 piezas sin un error). El segundo sale de `logros_hitos()`
    (`memoria_max_limpia`: la mayor cantidad de piezas reconstruida limpia);
  - «Las probaste todas» pasa a 19 actividades.
- **Los tipos 15 a 18** (Aguanta, Remata la ventaja, Elige a tiempo y Tus
  propios errores) ya contaban: los cuatro terminan en `terminar()`, así que
  se registran como `tipos`, entran a la cola de repaso y suman a «De todos
  los tipos». No hubo que tocarlos.
- **El resumen del día**, debajo de la meta en el hub: «Hoy: 12 ejercicios
  (Mates 6, Tipos de entrenamiento 4, Memoria 2) · 9 de 11 sin error ni
  pista · Para mañana: 3 repasos».
  - Antes cada página festejaba lo suyo y nadie juntaba el día.
  - Lo de hoy lo cuenta la base: `entreno_resumen_hoy()`, migración
    `20260929172621`, con el día de Costa Rica.
  - Los nombres son los de `js/tiempo-secciones.js`, los mismos de
    Informes.
  - Los repasos de mañana salen de todas las colas de «Repasar fallados» y
    de Aperturas.
  - Solo sale con algo hecho hoy; si la base no responde, no se pinta nada.
- Lo prueban `verificar-memoria-pagina.js` (el registro, limpio y no),
  `verificar-logros.js` (los logros de Memoria, con números que distinguen
  el hito del conteo) y `verificar-entreno-repaso.js` (el resumen, y que no
  salga sin nada hecho).

## Logros del Sonar, Batalla naval y Precisión; y el hub propone lo empezado

- **Logros nuevos**:
  - «Cazatesoros»: 10 partidas del Sonar.
  - «Oído fino»: 5 tesoros con tres estrellas.
  - «A toda vela»: 10 partidas de Batalla naval.
  - «Almirante»: ganarle un duelo a la computadora.
  - «Ojo de estratega»: 3 tandas de Precisión posicional con 70 % o más.

  Los que no son «cuántos» salen de `public.logros_hitos()` (migración
  `20260929165038`, SECURITY INVOKER: la RLS de `training_progress` decide).
  No se agregaron claves a `por_actividad` de `progreso_dias_y_racha()`:
  el panel suma todas esas claves para contar ejercicios y las inflaría.
  `js/logros.js` pide los hitos a la par de la racha; si fallan, cuentan
  cero y la racha no se cae. Se probó en la base con filas de prueba
  (revertidas) e impersonando a un alumno:
  - 70 % cuenta y 69,9 % no;
  - un duelo perdido no cuenta;
  - los hitos de otro alumno salen en cero.
- La página de Logros **tenía «tipos» sin título** (salía la clave); ahora
  dice «Tipos de entrenamiento», y las tres categorías nuevas tienen el
  suyo.
- **El «Hoy te toca» propone lo empezado que no vence**, al final de la
  lista (así solo sale cuando hay lugar, tres como mucho):
  - **los finales contra la máquina a medias**: «Seguir con los finales
    contra la máquina: «El rompimiento de peones» (1 de 17 logrados)» →
    `finales.html?final=<id>`. A quien nunca jugó uno no se le propone, y
    con todos logrados tampoco.
  - **una tanda de Precisión posicional** si ya hizo alguna y la última
    fue hace 7 días o más (`DIAS_SIN_PRECISION`). La fecha sale del
    historial de la cuenta (`training_state`,
    `precision_posicional_historial_v1`), no de `training_progress`: así
    cuenta también lo hecho antes de que las tandas se registraran ahí.
- Lo prueban `verificar-logros.js` (los cinco logros, los títulos, que se
  pida `logros_hitos`) y `verificar-entreno-repaso.js` (las dos propuestas,
  con sus casos de no proponer).

## Repasar fallados también en Tipos y Finales; y `limpio` en Tipos, Practicar y 4×4

- **Tipos de entrenamiento tiene la cola de «Repasar fallados»**
  (`entreno_tipos_repaso_v1`, por `"tipo:id"`). Como cada tipo tiene su propia
  forma de puntuar, lo que manda son las estrellas:
  - tres (sin error ni pista, o perfecto en Con lo justo y Fotografía):
    «bien», y a la primera no entra;
  - dos: «regular»;
  - una o ninguna: «mal», y vuelve hoy mismo.

  La portada de los tipos ofrece el repaso cuando algo vence hoy
  (`#repaso-tipos` → `tipos.html#repaso`). El repaso junta ejercicios de
  TODOS los tipos (`partida.cola`), y cada uno se juega con el juego de su
  tipo. Antes de abrirlo se cargan los tipos que traen algo aparte (el
  maestro, rey y peón); si uno no carga, sus ejercicios quedan fuera hoy. El
  repaso no pisa `tipos_ultimo_v1`, que sigue siendo «el nivel que quedó a
  medias» del hub. Repasar no vuelve a registrar nada: ya contó la primera
  vez.
- **Finales tiene la misma cola** (`entreno_finales_repaso_v1`):
  - un final perdido, o unas tablas cuando había que ganar, vuelve hoy mismo;
  - uno logrado con pista vuelve pronto;
  - uno logrado limpio a la primera no entra.

  La pestaña de un final que toca repasar lo dice escrito («🔁» y «toca
  repasarlo hoy» en su etiqueta), y la barra, cuántos toca repasar.
  `?repaso=1` abre el primero, aunque haya otro sin lograr antes.
- **El hub los propone**: «Repasar 2 ejercicios de Tipos que te costaron» →
  `tipos.html#repaso` y «Volver a jugar 1 final que te costó» →
  `finales.html?repaso=1`. Siguen siendo tres cosas como mucho.
- **`limpio` en `training_progress`** en tres páginas más:
  - **Tipos**: `limpio` = tres estrellas, en la primera vez que se resuelve,
    como en Mates.
  - **Practicar**: registra por serie, así que manda `rondas`,
    `rondas_limpias` (tres estrellas: sin error, sin pista y sin «Ver
    solución») y `limpio` (la serie entera).
  - **4×4**: no tiene pistas ni jugadas rechazadas, así que el tropiezo es
    quedarse sin capturas o reiniciar a medio camino. Volver a empezar un
    ejercicio ya ganado, o pasar a otro, es un intento nuevo.

  Hoy nada lee esos campos: son para el día que alcancen los intentos para
  calibrarlos como Mates (ver «Calibrar los Mates con los intentos reales»).
  «El tema más flojo» sigue contando solo Temas y Táctica, que son las que
  tienen motivo.
- Lo prueba `verificar-entreno-repaso.js`: las dos colas, el repaso de
  Tipos de punta a punta, `?repaso=1` de Finales, el hub y el `limpio` de las
  tres.

## Un solo repaso del día

Con seis colas de «Repasar fallados» más Aperturas y las preguntas de clase,
«Hoy te toca» proponía UNA cosa por cola. Con tres colas vencidas, el repaso
ocupaba las tres líneas de la lista, y el plan, el tema más flojo o el
diagnóstico no llegaban nunca. Además había que entrar a cada sección por
separado.

- **Con dos secciones o más que tienen algo hoy, va UNA cosa**: «🔁 Repaso del
  día: 5 en 3 secciones (Ejercicios por tema 2 · Mates 1 · Aperturas 2)».
  Con una sola sección se sigue diciendo tal cual («Repasar 2 mates que te
  costaron»): un recorrido de un paso no aporta nada. Las cuentas son las de
  siempre (`RepasoFallados.pendientes` y las líneas de Aperturas ya empezadas
  y vencidas), ahora en `repasosDeHoy()` de `js/hoy-te-toca.js`.
- **Tocarlo arranca un recorrido**: la barra de «Entrenar 10 minutos»
  (`js/tanda-diez.js` → `TandaDiez.empezarRepaso`) en modo repaso. Va **sin
  reloj**, porque un repaso se termina y no se corta a los diez minutos. Dice
  «Repaso del día, paso 1 de 3: Ejercicios por tema (2)», lleva a la sección
  siguiente y, en la última, «Terminar el repaso». Dura 12 horas (si queda a
  medias, mañana es otro repaso) y es del aparato (`tanda_diez_v1`, con
  `tipo: "repaso"`), como la tanda.
- **Cada sección sigue repasando a su manera**: el recorrido solo encadena
  los `?repaso=1` (y `tipos.html#repaso`) que ya existían. Juntar los
  ejercicios de todas en una sola página habría sido reescribir seis
  tableros distintos (Finales se juega contra la máquina, Visualización no
  tiene tablero que se toque), y cada uno ya tiene su manera de puntuar.
- Sin la barra o sin almacenamiento, el enlace sigue llevando a la primera
  sección.
- Lo prueban `verificar-entreno-repaso.js` (el texto, que deja lugar para lo
  demás, el recorrido de punta a punta y el final) y `verificar-panel.js`
  (lo mismo en el panel, con las direcciones desde la raíz).

## El tema más flojo, en el hub

El «Hoy te toca» propone el motivo que menos sale limpio («Tu tema más flojo,
«Clavada»: limpio en 4 de 11», que lleva a `temas.html?tema=pin`) cuando
está por debajo del 70 % (`TemaFlojo.FLOJO`). La cuenta es la misma de
Informes (`js/tema-flojo.js` → `informes_tema_mas_flojo`, ver «El tema más
flojo» en informes.md); el hub se queda con la fila del alumno de la sesión.
Si la base no responde, no se propone nada. Lo prueba
`verificar-entreno-repaso.js`.

## Coordenadas insiste en las casillas que cuestan

Antes cada casilla salía al azar parejo y no se guardaba cuáles fallaba el
alumno. Ahora `js/coordenadas-casillas.js` lleva, por casilla, aciertos y
fallos (`entreno_coord_casillas_v1`: `"e4:a"`, `"e4:f"`, que viaja con la
cuenta con `maxPorClave`: los contadores solo suben) y el sorteo pesa
`1 + 3 · fallos / (aciertos + fallos + 1)`.

- Todas siguen saliendo (una nunca vista o dominada pesa 1); una que se falla
  casi siempre sale hasta cuatro veces más. Una ronda solo de las difíciles no
  entrenaría el tablero entero.
- **Cada pedido cuenta UNA vez**: fallo si hubo algún error o se acabó el
  tiempo, acierto si salió a la primera. Tres clics malos en la misma no son
  tres fallos (los «errores» de la ronda sí siguen contando cada clic).
- Vale igual en Modo Adaptado (decir el color de la casilla).
- Al terminar, la ronda nombra las que más cuestan (con al menos dos fallos):
  «b6 (fallada 9 de 10 veces)».
- Lo prueba `verificar-entreno-arreglos.js` («Coordenadas: las casillas que
  cuestan»), con el sorteo medido en 64 000 tiros.

## Tipos: al tablero también se le pregunta

El recuadro de la jugada de Tipos de entrenamiento solo aceptaba jugadas o
casillas; ahora entiende también las preguntas de todo Entrenamiento
(`js/comandos-tablero.js`: «posición», «reyes», «qué hay en e4», «fila 4»,
«ayuda»), antes de tratar el texto como respuesta. Una pregunta no cuenta como
error. Tres cuidados:

- **Una casilla sola («e4») no es pregunta**: es la respuesta de varios juegos
  (Descarte, el Barrido, Ruta segura), y `interpretar()` no la toma.
- **Con las piezas tapadas (Fotografía) no se contesta nada**: la posición es
  lo que hay que recordar.
- **Sin partida de verdad** (un tablero armado a mano, Constrúyela tú),
  «jugadas de f3» no se cuenta: «no tiene jugadas» sería falso.

Visualización ya preguntaba con el mismo módulo, y el 4×4 tiene su propio
cuadro a propósito: su tablero es de 4×4 y el común supone uno de 8×8. Lo
prueba `verificar-tipos-pagina.js` («reyes» en ¿Qué quiere el rival?).

## Practicar y Aprender: las posiciones escritas en el código, revisadas

Las series de Practicar (`SETS` en `js/entreno-practicas.js`) y las lecciones
de Aprender (`LESSONS` en `js/entreno-aprender.js`) viven en el código y ningún
verificador las recorría. `verificar-practicar-aprender.js` (sin navegador)
las recorre todas con chess.js, y al estrenarlo encontró diez ejercicios mal:

- **Siete posiciones ilegales**: el rey del que no juega ya estaba en jaque
  (chess.js no lo mira). Los cuatro de «Mate con dama o torre apoyada»
  (`7k/8/6K1/…/7Q`: la dama de h1 ya daba jaque por la columna), un
  descubierto y la lección del descubierto (el alfil que tapaba la diagonal
  daba jaque él mismo: un alfil no puede «tapar» una diagonal), y un ataque
  doble.
- **Tres «ataques dobles» que regalaban la pieza**: la torre de e8 se comía la
  dama de e4, la dama de a6 la torre de a2, y en la lección la torre de a8 se
  comía la dama de d8. Una torre no puede atacar una dama sin que la dama
  pueda comérsela.

Cada uno se rehizo con el cambio más chico que lo deja bien (la dama que llega
por la fila y no por la columna, una torre o un caballo tapando en vez del
alfil, piezas menores como blanco), comprobado con chess.js.

**Y la página acepta cualquier jugada que cumpla el motivo**, no solo la
guardada (`js/motivos-tacticos.js`, el mismo módulo que usa el verificador): en
un ataque descubierto todo salto del caballo descubre el jaque, y en varias
horquillas y dobles hay otra jugada que también lo es; 47 respuestas buenas se
rechazaban con «no es la jugada que buscamos». Cumplir el motivo exige también
que el rival no pueda comer la pieza que atacó: una horquilla que regala el
caballo no es lo que el ejercicio enseña. Las lecciones de táctica dicen su
`motivo`. Lo prueba `verificar-entreno-arreglos.js` («cualquier jugada que
cumpla el motivo»).

No se mudaron a JSON: lo que faltaba era que alguien las revisara, y el
verificador las lee donde están.

## Repasar lo que costó y «Hoy te toca»

> «Hoy te toca» vive en `js/hoy-te-toca.js` y lo pintan el hub y el panel del
> alumno (ver «Hoy te toca, también en el panel» en `paneles.md`). Un cambio
> acá se ve en los dos.

`node herramientas/verificar-todo.js entreno-repaso` lo comprueba en un
navegador.

- **Un ejercicio de Ejercicios por tema resuelto con error o con pista entra a
  una cola de repaso espaciado** (`js/repaso-fallados.js`, sobre el mismo
  `js/repaso-espaciado.js` de Aperturas). Antes se marcaba resuelto igual y no
  volvía a salir nunca. Con error vuelve hoy mismo y el intervalo empieza de
  cero; solo con pista, vuelve pronto; repasado limpio, el intervalo crece.
  **Lo resuelto limpio a la primera no entra nunca**: la cola es de lo que
  costó, no de todo lo hecho.
- **Tres repasos limpios seguidos lo sacan de la cola**, y «sacar» es una
  marca (`fuera: true`), no un borrado. La cola (`entreno_temas_repaso_v1`)
  viaja con la cuenta con la fusión `srsPorLinea`, que SUMA fichas y se queda
  con la de `ultimo` más nuevo: una ficha borrada en un aparato volvería desde
  la cuenta sin que nada fallara. Uno que salió y se vuelve a fallar entra de
  nuevo, desde cero.
- **La lista de temas ofrece «Repasar fallados» solo cuando hoy toca alguno**,
  y `temas.html?repaso=1` abre la cola directo. Mientras se repasa, la lista
  es la de hoy, fija: lo que se vuelve a fallar queda para la próxima, no se
  repite en la misma sesión. **Repasar no vuelve a registrar el ejercicio en
  `training_progress`**: ya contó la primera vez, y contarlo de nuevo inflaría
  lo que ve el profesor. «Saltar» en el repaso no lo reprograma.
- **El hub de Entrenamiento dice qué toca hoy** (`#hoy`, hasta tres cosas,
  cada una con cuántas son y a dónde lleva): los repasos vencidos de Temas, las
  líneas de Aperturas ya empezadas cuyo repaso venció (las nuevas no cuentan:
  eso es estudiar algo nuevo, no un repaso pendiente) y el diagnóstico si
  falta o tiene más de cuatro semanas, que es lo que pide la última semana del
  plan. Todo sale del progreso que ProgresoUsuario ya bajó de la cuenta. Sin
  nada pendiente, el bloque no sale.
- **Arriba de todo, la meta del día**: «Hoy llevas 3 de 5 ejercicios para que
  el día cuente. Tu racha: 4 días 🔥», con su barra (y `aria-valuenow`). La
  cuenta es `Logros.cargar()` → `progreso_dias_y_racha`, la misma de Logros y
  del panel, y la meta es `Logros.META_DIARIA`: no se escribe otra vez. Antes
  solo se veía entrando a Logros. Por eso **el bloque ya no se calla sin nada
  pendiente**: queda la meta, que cambia de un día a otro y dice qué hacer. Si
  la racha no se puede leer, la meta no sale y el bloque vuelve a depender de
  que haya algo pendiente.
- **Lo primero de la lista de «Hoy te toca» es la semana del plan del diagnóstico**
  («📅 Tu plan, semana 2 de 4 · Valor del material: Ejercicios de pieza
  colgada (✓ 3 hechos)»). El plan de cuatro semanas vivía solo en la página
  del diagnóstico y en los datos se veía: de los 52 alumnos que lo habían
  hecho, 17 no volvieron a entrenar y 19 lo dejaron a los uno o dos días. El
  plan decía qué hacer; nadie se lo recordaba. Ver «La semana del plan, en el
  hub y en el panel».
- **Mates tiene la misma cola** (`entreno_mates_repaso_v1`, también en
  `CLAVES`): una pestaña más, «🔁 Repasar fallados», que solo aparece si hoy
  toca alguno, y `mates.html?repaso=1` para abrirla directo. El hub la cuenta
  aparte («Repasar N mates que te costaron»). «Hoy te toca» muestra como mucho
  tres cosas, en este orden: repasos de Temas, de Mates, de Aperturas y el
  diagnóstico; lo que no entra aparece cuando se despeja alguna de las otras.
- El doble de Supabase de los verificadores de Entrenamiento es uno solo:
  `herramientas/lib/doble-entreno.js`.

### Una sola copia: js/ejercicio-tablero.js

Los errores de la sección anterior eran, casi todos, diferencias entre copias
del mismo código en cinco páginas. Lo que comparten Temas, Mates, Practicar,
Desafíos y Visualización vive ahora en `js/ejercicio-tablero.js`:

- **La racha** (`EjercicioTablero.racha(prefijo)`): guarda en
  `<prefijo>_streak` y `<prefijo>_best` y pinta `#streak-count`,
  `#streak-best` y `#streak-bar`. Las páginas siguen llamando `getStreak()`,
  `setStreak()`… (se sacan del módulo con una desestructuración), así que nada
  más cambió de nombre. **Desafíos tiene ahora su propia racha**
  (`entreno_desafios_*`, en `CLAVES`): antes escribía en la de Practicar, y
  fallar en una cortaba la racha de la otra. Su mejor marca arranca de cero.
- **El orden del tablero** (`casillas(orientacion)`): desde el bando que juega.
- **Qué es un acierto** (`esAcierto(juego, jugada, esperada)`): la jugada de
  la solución o cualquiera que dé mate. Practicar sigue comparando origen y
  destino (sus series no guardan la jugada en notación), más el mate.
- **La coronación** (`jugarCoronando`): el diálogo de todo el sitio,
  `js/coronacion.js`, que dice el nombre de cada pieza. Temas, Mates y
  Desafíos tenían cada una su propio `#promo-modal` (el de Mates sin nombres
  para el lector de pantalla); se fueron los tres. `tablero-cabecera.py` pone
  `coronacion.js` en toda página que cargue el módulo, y
  `verificar-coronacion.js` comprueba que ninguna de las tres vuelva a tener un
  diálogo propio.

- **El tablero** (`dibujar(tablero, {...})`): Temas, Mates, Practicar y
  Desafíos lo pintan con la misma función. Cada casilla lleva su estado en
  `data-estado` («seleccionada», «de la última jugada», «pista: la pieza que se
  mueve»), que es lo que `js/tablero-accesible.js` le suma a lo que oye el
  lector de pantalla. Con eso, **Practicar y Desafíos también se miran desde el
  bando que juega** (hay series con negras que se veían al revés) y **Mates
  marca la respuesta del rival**, como ya hacía Temas. Desafíos dejaba su
  propio `aria-label` en cada casilla; ahora lo escribe `tablero-accesible.js`,
  igual que en las demás.
- **Las pistas** (`pistas({...})`), por etapas: `texto`, `origen`, `destino` y
  `solucion`. Cada página dice cuáles usa:
  - Temas: el **motivo** primero cuando el grupo los mezcla («recomendados»,
    «fases», «largo»…) y el ejercicio trae uno conocido; después la pieza y la
    solución. Dentro de un tema, el motivo ya lo dice el título.
  - Mates: la pieza y la solución.
  - Practicar: la pieza, el destino y la solución.
  - Desafíos: su pista escrita si la trae; si no, la pieza y el destino (antes,
    sin pista escrita, las dos primeras marcaban la misma pieza). Después, la
    solución.
  El botón dice lo que va a hacer («Pista», «Otra pista», «Ver solución»), y
  **la marca de la pista sobrevive a los repintados**: antes se ponía a mano
  sobre la casilla y se perdía con el siguiente clic. Cada pista cuenta para
  las estrellas igual que antes.

Lo que sigue siendo de cada página es el flujo del ejercicio (la respuesta del
rival, cuándo termina, qué se registra). Aprender y Visualización no entraron:
Aprender no tiene pistas y Visualización no tiene tablero que se toque.

## El plan del diagnóstico que ve el alumno

`entreno/diagnostico.html` pinta el plan **entero**, las cuatro semanas con su
meta. Antes pintaba solo las tres primeras y sin la meta: con tres áreas
flojas se caía la cuarta, «Juntar todo y volver a medir», la que manda a
repetir el diagnóstico.

**Cada enlace del plan dice cuánto se hizo ahí desde el diagnóstico**
(«(✓ 12 hechos)», «(todavía nada)»), en esta página y en Informes, con la misma
función (`PlanEntrenamiento.marcarAvance`). Antes el plan era texto quieto y
nadie sabía si se estaba siguiendo. La cuenta la hace `avance_del_plan(alumno,
desde)` en la base (migración `20260928132719`, `SECURITY INVOKER`: la RLS de
`training_progress` decide, y preguntar por otro alumno da cero filas), porque
un alumno activo pasa de mil filas en un mes y PostgREST corta a mil sin
avisar. Cada recurso se traduce a una clave (`PlanEntrenamiento.claveDeAvance`):
`tema:<clave>`, `mates:<categoría>`, `curso:<slug>` o `actividad:<nombre>`.
Lo que no deja rastro en `training_progress` (una ficha de Estudio, una página
de juego) no tiene clave y **no lleva número**: un «0» diría que no hizo nada,
y no se sabe. «Desde» es la fecha del diagnóstico del que salió el plan
(`diagnostico_fecha` si es el que compartió el profesor). La prueban
`verificar-entreno-arreglos.js` (esta página) y `verificar-informes.js`.

Si el profesor ya revisó el diagnóstico y le **compartió** su plan desde
Informes (`training_plans`, que la política solo le devuelve al alumno cuando
está compartido), se ve ese, con su nota, y no uno recalculado aparte. Vale
para el diagnóstico del que salió o uno anterior; si el alumno hizo uno nuevo
después, ese plan quedó viejo y se muestra el recalculado. Lo que el profesor
reescribió a mano va por `textContent`, y un recurso con esquema
(`javascript:`, `https:`) no se pinta: los recursos son rutas del sitio.

### La semana del plan, en el hub y en el panel

`PlanEntrenamiento.hoyDelPlan(sb, alumno, detalle)` contesta «¿qué pide hoy
el plan?» y lo usan dos pantallas: «Hoy te toca» (`entreno/index.html`) y la
franja del panel (`clases.html`, ver «La semana del plan, para quien ya
arrancó» en paneles.md). Una sola cuenta para que las dos digan lo mismo que la
página del diagnóstico.

- **Qué plan**: el que el profesor compartió desde Informes si vale para este
  diagnóstico (`planCompartido()`, la misma regla que usaba sola la página del
  diagnóstico y que se mudó al módulo); si no, el recalculado.
- **Qué semana** (`semanaVigente()`): la 1 empieza el día del diagnóstico y
  cada una dura siete días de calendario **en hora de Costa Rica**. Pasada la
  última, el plan terminó y no sale nada: ahí «Hoy te toca» ya pide repetir el
  diagnóstico, que es lo que dice la última semana.
- **A dónde manda** (`recursoPrincipal()`): el primer recurso de la semana cuyo
  trabajo CUENTA (tiene clave en `claveDeAvance()` y no es la portada de un
  curso), para que el número suba y al día siguiente se vea el avance. La
  portada de un curso solo si la semana no trae nada mejor. Un recurso con
  esquema (`javascript:`, `https:`) no se vuelve enlace (`recursoSeguro()`,
  que ahora usa también la página del diagnóstico).
- **Cuánto lleva**: `avance_del_plan()` desde la fecha del diagnóstico, igual
  que los «(✓ N hechos)» del plan entero. Sin clave no hay número (un «0»
  diría que no hizo nada, y no se sabe), y la semana que manda a repetir el
  diagnóstico tampoco lleva: contaría el mismo diagnóstico del que salió.
- **El emoji del título no entra en la frase** («Semana 2 · ⚖️ Valor del
  material» → «Valor del material»): el lector de pantalla lo leería en voz
  alta.
- Lo prueban `verificar-entreno-repaso.js` (el hub) y `verificar-panel.js`
  (la franja), con lo esperado leído del plan de verdad y no escrito a mano.

## Estudio manda a practicar el tema de la ficha

Las fichas de táctica y conceptos que nombran un tema de Ejercicios por tema
traen `temaPractica` (la clave en `temas.json`) y la página les pone el botón
«🎯 Practicar este tema» (`temas.html?tema=<clave>`, el mismo enlace de las
tareas). `verificar-fichas.js` comprueba que el nombre del texto y la clave
sean el mismo tema. **Ojo con los nombres de Lichess**: la horquilla es
«Ataque doble» (`fork`) y la enfilada es «Pincho» (`skewer`). Las dos fichas
estaban cruzadas —la horquilla mandaba al pincho y la enfilada a los rayos X—
y el alumno practicaba otro motivo sin que nada fallara.

## El hub de Entrenamiento y sus grupos

`entreno/index.html` reparte los accesos en **Fundamentos** (Mates,
Aprender, Coordenadas, Desafíos), **Practicar** (Ejercicios por tema, Practicar), **Entreno** (Aperturas y
celadas, 4×4, Visualización, Precisión posicional, Finales contra la máquina,
Memoria) y
**Tipos de entrenamiento** (una sola tarjeta que abre su ficha, ver «Los Tipos
de entrenamiento»).

Es la puerta de quien da clase o administra. El alumno no pasa por él: su
panel tiene una tarjeta por entrenamiento, y las migas de cada página cuelgan
del panel, no del hub (ver «El alumno ve el entrenamiento abierto» en
`paneles.md`).

- **Cada acceso es un encabezado de verdad (`<h3>`), no un `<span>`**, y eso es
  el punto, no un detalle de maqueta: quien usa lector de pantalla se mueve
  saltando de encabezado en encabezado. Con el nombre metido en un `<span>`
  había que tabular por los ocho enlaces para llegar al último; con un `<h3>`
  por acceso dentro del `<h2>` de su grupo, Entrenamiento se recorre entero de
  un salto por tarjeta. Los niveles van `h1 → h2 → h3` **sin saltarse
  ninguno**.
- **Un solo enlace por tarjeta**, con el título como enlace y su `::after`
  estirando el área de clic sobre toda la tarjeta — el mismo patrón de
  `cursos.html`. Con dos enlaces al mismo destino, el lector de pantalla lo
  anuncia dos veces.

### La táctica se mudó dentro de Ejercicios por tema

`entreno/tactica.html` era una segunda página resolviendo exactamente lo mismo
que `entreno/temas.html`: su propio tablero, su propia racha y su propia lista
de resueltos. El mismo ejercicio se podía resolver en las dos y contaba dos
veces. Ahora sus 148 ejercicios son **un grupo más del selector de temas**
("Táctica de ataque", con sus cinco categorías), y `tactica.html` solo manda a
`temas.html` — la dirección está en favoritos de quien la usaba y un 404 no le
dice a nadie a dónde ir.

- **El traslado lo hace `entreno/data/sumar_tactica.py`, no una edición a mano
  de `temas.json`.** Ese archivo lo GENERA `construir_temas.py` desde Supabase,
  así que un grupo escrito a mano se perdería en la siguiente corrida sin que
  nada fallara. Por eso `construir_temas.py` llama a `sumar()` al final: una
  sola implementación, dos puertas de entrada. Se puede correr todas las veces
  que se quiera (si el grupo ya está, lo reemplaza).
- **Estos ejercicios no traen `rating`**: son de la casa, no de Lichess. La
  página tiene que aguantar que falte, y no lo hacía — escribía "Dificultad
  undefined" debajo de cada tablero, que no da ningún error, solo se ve mal.
- **Lo que ya llevaba resuelto cada quien se hereda.** `heredarTactica()` funde
  `entreno_tactica_solved` dentro de `entreno_temas_solved` al cargar. Los ids
  no se pisan (los de táctica son texto, `ultima-linea-001`; los de Lichess son
  números) y como se unen y no se reemplazan, correrlo mil veces da lo mismo.
  Va **después** de `ProgresoUsuario.init()`, o sea sobre la lista ya bajada de
  la cuenta.
- **Informes sigue contando Táctica aparte.** Si todo se apuntara como `temas`,
  esa columna se habría quedado congelada en el número del día de la mudanza —
  y eso no da ningún error: el profesor ve un número que ya no sube y no sabe
  por qué. Así que `EntrenoProgress.log()` elige la actividad según el tema.
  **Qué temas son de táctica sale del propio `temas.json`** (`temasDeTactica()`
  lee el grupo), no de una lista copiada en la página: con la lista a mano,
  agregarle una categoría al grupo la dejaría contando como "temas" sin que
  nada fallara.
- `GROUP_ICON` de `temas.html` necesita una entrada por grupo: sin ella el
  grupo nuevo se pinta con un punto pelado.

**Al tocar el hub, `temas.html` o el traslado, correr `node
herramientas/verificar-entreno.js`** (con el sitio en localhost:8777,
playwright y `npm install chess.js@0.10.3`). Cuenta los 148 ejercicios uno por
uno contra `tactica.json` —uno que se pierda por el camino no da ningún error,
el grupo simplemente tiene menos— y comprueba con chess.js que cada solución
siga siendo jugable y que el mate prometido sea mate. Después, en un navegador:
los cuatro grupos con lo suyo, que cada acceso sea un encabezado, que no se salte
ningún nivel, que el clic en la esquina de la tarjeta siga abriendo su enlace,
que `tactica.html` redirija, que el progreso se herede y que un ejercicio de
táctica se apunte como `tactica`.

## Finales contra la máquina

`entreno/finales.html`: los finales de libro que hay que saber de memoria
—el peón pasado lejano, el rompimiento, la mayoría en el flanco de dama, el
alfil del color equivocado y el correcto, alfiles de distinto color, caballo
contra peón, dama contra peón en séptima (central, de torre y de alfil), dos
peones en sexta contra la torre, torre contra peón, cortar al rey, Philidor,
Lucena, Vancura y torre contra alfil (17)— jugados contra Stockfish a máxima fuerza
(`PracticeEngine.getMove(fen, "max")`, el mismo Worker de la clase en vivo).
Cada uno tiene una meta: **ganar** (dar mate) o **salvar** (hacer tablas).

- **No hay «la jugada de la solución».** El rival es el motor y lo que decide
  es cómo termina la partida, según chess.js: el mate del alumno es ganar;
  ahogado, triple repetición, 50 jugadas o material insuficiente son tablas.
  Salvar también se logra **aguantando** `aguantar` jugadas propias (25): al
  llegar, el motor mira la posición y, si ya está perdida (mate a la vista o
  dos peones abajo), no cuenta. **Si el motor no contesta, no se da por
  logrado**: no se puede saber, y regalarlo mentiría en Informes.
- **Ninguna posición se cree a ciegas.** Son las de los libros, escritas a mano
  en `herramientas/finales-generar.js`, que las pasa por chess.js (legal: el
  bando que no mueve no puede estar en jaque, que cuelga a Stockfish) y por
  Stockfish a profundidad 26 desde el lado del alumno: ganar pide mate o +4;
  salvar, 0,5 o menos. Lo que dijo el motor queda en el banco (`motor`) y
  `verificar-finales.js` lo vuelve a exigir sin motor. `entreno/data/finales.json`
  no se edita a mano.
- **Lo que ya existía no se repite**: los mates básicos (dama, torre, dos
  alfiles, alfil y caballo) son «Con lo justo» y rey y peón contra rey es «Rey y
  peón», los dos en Tipos de entrenamiento, con tablas exactas.
- **Cuenta UNA vez por final** (como Mates): ganarlo o salvarlo lo marca
  (`entreno_finales_solved`, viaja con la cuenta) y escribe una fila
  `activity = 'finales'` con `final_id`, `meta` y cómo salió. Por eso la
  actividad está en el CHECK de `training_progress` (migración
  `20260928232013`), en el catálogo de Tareas (meta de cantidad), en el tiempo
  por sección (también en el correo a la casa: `informes-encargados`), en el
  área de finales del plan del diagnóstico y en Logros (medalla «Final de
  libro», 5 finales).
- **`verificar-finales.js` revisa además que la base acepte TODA actividad que
  las páginas registran**: busca cada `EntrenoProgress.log('<x>', …)` de `js/`
  y la exige en el CHECK de la última migración que lo define. Una actividad
  fuera del CHECK se rechaza sin que nada avise (ver «Cuatro actividades se
  sumaron al CHECK»). Ya no queda ninguna fuera: `finales100` entró después
  (ver «La práctica de los cursos de finales cuenta»).
- Dos pistas: la idea del final y, después, «la máquina jugaría…» con la pieza
  resaltada. Cualquiera de las dos cuenta como pista (`con_pista`).
- Las jugadas se escriben como en el resto del sitio (`Tc2`, no `Rc2`): la
  traducción es `TiposReglas.sanEs()`.
- `verificar-finales-pagina.js` la juega en un navegador con un motor de
  mentira: ganar cuenta una vez, salvar con la posición en tablas cuenta, con
  la posición perdida o sin motor no, y la máquina empieza cuando la posición
  es del otro bando.

## La ficha de Memoria

`entreno/memoria.html` (tarjeta **"📷 Memoria"** del grupo Entreno del hub):
ves una posición unos segundos, desaparece y la reconstruyes. Es la idea de
thememorychess.com, donde la dificultad la pone quien juega: **eliges cuántas
piezas (de 3 a 32) y cuántos segundos (de 3 a 60)**, y con «Una pieza más»
—solo después de una reconstrucción sin errores— la vas subiendo de a una.
`memoria.html?piezas=8&segundos=10` arranca directo con eso, así el profesor
manda el enlace con la dificultad ya puesta; la página deja la dirección así
al empezar, para que se pueda copiar.

- **Es Fotografía sin niveles fijos, y comparte con ella todo lo que se
  puede.** Fotografía (Tipos de entrenamiento) tiene cinco niveles con rangos
  de piezas y segundos que no se eligen; esta ficha no reemplaza a esa, la
  deja a medida. La corrección es la MISMA (`TiposReglas.compararFoto`,
  `leerPiezas` y `estrellasFoto`, de `js/tipos-reglas.js`) y el tablero es el
  común de Entrenamiento (`EjercicioTablero.dibujar`); lo propio vive en
  `js/entreno-memoria.js`.
- **Ninguna posición se inventa.** `herramientas/memoria-generar.js` arma
  `entreno/data/memoria.json` del banco de Lichess de «Ejercicios por tema»:
  la posición de cada ejercicio y las que se van dando al jugar su solución.
  Así hay de 3 a 32 piezas, todas de partidas jugadas (de 32 piezas hay 53
  en el banco). Un sorteo de piezas al azar, como hacen otros sitios, da
  posiciones que no pasan en una partida, y memorizarlas no entrena ver el
  tablero por grupos con sentido. Se guardan 40 por cantidad de piezas, sin
  repetir la misma colocación; el archivo no se edita a mano. Al corregir, un
  enlace lleva a la partida de Lichess de donde salió.
- **Esconde de verdad**, igual que Fotografía: al reconstruir el tablero no
  tiene piezas y la lectura escrita del Modo Adaptado desaparece (sería
  soplar). Se reconstruye tocando casillas con una paleta o **escribiendo**
  «Rg1 Tf1 a2» por color. Las marcas de la corrección llevan su signo escrito
  (✓ − ✗ +).
- **El récord vive en la cuenta**: `memoria_mejor_v1` (segundos → la mayor
  cantidad de piezas reconstruida sin un error, `maxPorClave`). Solo una
  perfecta lo mueve. El tiempo se anota con `data-activity="memoria"`, que
  está en las dos tablas de nombres (`js/tiempo-secciones.js` y la de
  `informes-encargados`); la función del correo tiene que volver a
  desplegarse para que el correo a la casa la nombre (hasta entonces dice
  «memoria» a secas).

**Al tocar el banco o la página, correr**:

    node herramientas/memoria-generar.js        # solo si cambia el banco
    node herramientas/verificar-todo.js memoria memoria-pagina

El primero comprueba sin navegador que cada posición tenga exactamente sus
piezas, sea legal y sea una posición real del banco de Lichess, que el
archivo sea lo que arma hoy el generador y que la corrección cuente bien. El
segundo juega la página: la posición que se ve es la del banco, se esconde
sola al terminar la cuenta, escrita entera sale perfecta y guarda el récord,
«Una pieza más» sube a la siguiente, y con errores el récord no se mueve.
Está probado que fallan: una FEN inventada en el banco hace saltar 2
comprobaciones; dejar la lectura escrita al reconstruir, o guardar el récord
de una con errores, las que corresponden.

## Aperturas y celadas: memorizar jugando, con repaso espaciado

`entreno/aperturas.html` es un banco de 40 líneas —12 celadas y 28 aperturas—
que el alumno memoriza **jugándolas en el tablero**: el entrenador mueve por el
rival y él tiene que dar todas las jugadas de su color, de memoria. Al terminar,
la línea se programa para más adelante.

- **El banco vive en `js/aperturas-lineas.js`**, en notación inglesa porque es la
  que entiende chess.js; la página la traduce (C, A, T, D, R) antes de
  enseñarla. **El `id` de cada línea no se cambia nunca**: es la clave con la que
  queda guardado el avance de cada alumno.
- **`js/repaso-espaciado.js` es SM-2 recortado**: facilidad de 1.3 a 3.0,
  intervalos de 1 y 3 días fijos al principio y de ahí multiplicando, con tope
  de medio año. No sabe nada de ajedrez —es `{ id → ficha }`—, así que sirve
  para cualquier cosa que se repase.
- **Tres notas, no cinco.** Cinco grados obligan a pensar cuánto de bien te
  salió, que es justo lo que no debe ocupar la cabeza mientras se estudia.
- **La nota la pone la página, no el alumno.** Los SRS suelen preguntar "¿qué
  tal te salió?" y con chicos eso no mide nada: el que quiere terminar rápido
  aprieta "bien" siempre. Acá sale de lo que de verdad pasó —cuántas veces se
  equivocó y cuántas pidió ver la jugada—, que no se puede maquillar.
- **La coronación se elige**, no se asume dama: la trampa de Lasker en la Albin
  solo funciona coronando caballo, y ese es el punto de la línea.
- El progreso son las claves `aperturas_srs_v1` (fusión `srsPorLinea`) y
  `aperturas_vistas_v1`, declaradas en `CLAVES` de `js/progreso-usuario.js`. La
  fusión nueva **no deja ganar a un aparato entero**: se queda con la ficha de
  CADA línea que se repasó más tarde, así que estudiar en la compu y en el
  celular suma. No escribe en `training_progress` —esa tabla tiene el CHECK de
  actividades y esto no es una de ellas—; el tiempo sí se registra con
  `js/tiempo-plataforma.js data-activity="aperturas"`.
- **Al tocar el banco o el SRS, correr `node herramientas/verificar-aperturas.js`**
  (necesita `npm install chess.js@0.10.3`). Comprueba con chess.js que **cada
  jugada exista de verdad en su posición** —466 jugadas—, que el mate prometido
  sea mate, que los ids no se repitan, que al alumno le toquen al menos tres
  jugadas, y de paso corre las pruebas del algoritmo de repaso. Una jugada mal
  escrita no da error en pantalla: el alumno no puede terminar la línea nunca y
  no entiende por qué.
- **Al tocar la página, correr `node herramientas/verificar-aperturas-pagina.js`**
  (con el sitio en localhost:8777 y playwright). Juega líneas enteras a punta de
  clics en un navegador de verdad, incluida la de la coronación, y comprueba que
  una jugada legal que no es la de la línea se rechace, que la pista baje la
  nota y que el avance quede guardado.
- **Esa comprobación mira además que la página se vea**, no solo que funcione,
  porque la primera versión salió rota de las dos maneras que se pueden romper
  al clonar la cabecera de otra página del sitio:
  - se coló el `</style>` de la página original, la hoja se cerró antes de
    tiempo y el navegador **imprimió el resto del CSS como texto** arriba de
    todo;
  - se quedó fuera el script del `<head>` que aplica el tema, y la página salía
    **siempre clara** aunque el resto del sitio estuviera en oscuro.
  Ninguna de las dos daba error: la página "funcionaba". Y `verificar-css.js`
  tampoco las veía, porque la lista de líneas solo existe después de iniciar
  sesión y él abre las páginas sin cuenta. Por eso ahora se comprueba que no
  haya CSS impreso como texto, que haya un solo `<style>`, que las clases
  propias pinten algo de verdad y que con el tema oscuro el fondo sea oscuro.
  **Al clonar la cabecera de otra página, mirar la pantalla, no solo el DOM.**

### Mi repertorio

El banco son 40 líneas iguales para todos. «🗂️ Mi repertorio», la tercera
pestaña de Aperturas y celadas, es lo que juega ESTE alumno, con blancas y con
negras (`js/repertorio-aperturas.js`, tabla `repertorio`). Va en la misma
página y no en otra: es la misma tarea —memorizar líneas jugándolas— y dos
puertas para lo mismo es el error que el panel ya cometió.

- **Se arma jugando las dos partes** en un tablero, escribiéndolas (una o
  varias: «1.e4 c5 2.Cf3», en la notación de acá o en la inglesa, con el mismo
  intérprete de todo el sitio) o partiendo de una línea del banco o de una
  suya. Solo entran jugadas legales: las hace chess.js.
- **Se entrena con el mismo entrenador y la misma cola de repaso**: cada línea
  suya es una línea más, con id `mi:<uuid>` en `aperturas_srs_v1`. Por eso
  entra sola en el «Repaso del día», que cuenta esa clave.
- **Una respuesta tuya por posición.** Si contestas 1.e4 con c5 en una línea y
  con e5 en otra, el entrenador te pediría dos jugadas distintas en el mismo
  lugar. Lo frena la base (trigger `repertorio_coherente`, también en un
  update) y la pantalla lo dice antes de guardar, con la jugada que ya tienes
  («Choca con «Siciliana»: en la jugada 1 ahí juegas c5»). Otra jugada del
  RIVAL no choca: es una rama más del árbol.
- **El árbol** junta lo que las líneas tienen en común y abre las ramas; una
  cadena sin ramas va en un renglón («1. e4 c5 2. Cf3 d6»), en la notación de
  acá.
- **La base no sabe ajedrez, pero exige la forma** de cada jugada (SAN), entre
  2 y 40, un tope de 100 líneas y que no se repita una línea. La legalidad se
  vuelve a comprobar al leerla: una fila que no se puede jugar no se entrena y
  se dice («Una línea no se pudo leer»), en vez de dejar al alumno frente a una
  línea que no puede terminar nunca.
- **Borrar una línea deja su ficha de repaso marcada como borrada**, con fecha
  de hoy y sin vencimiento. Si solo se quitara, la copia de la cuenta (que se
  queda con la ficha MÁS RECIENTE de cada línea, `srsPorLinea`) la devolvería,
  y el «Repaso del día» seguiría contando una línea que ya no existe.
- **Lo escribe solo el alumno**; lo leen también sus profesores, su
  supervisión y administración (como el cuaderno), para preparar sus partidas.
  Todavía no hay pantalla del profe que lo muestre: la base ya lo permite.

Comprobado impersonando roles en SQL: el alumno guarda; una segunda respuesta
a 1.e4 se rechaza con el mensaje, y también un update que la meta; otra jugada
del rival y otra apertura entran; una jugada mal escrita y una fila a nombre
de otro se rechazan; su profe la ve y no la cambia; una profesora ajena no ve
nada.

#### El repertorio en PDF

«🖨️ Bajar en PDF» arma una hoja con una tabla por color: cada línea entera en
la notación de acá (Cf3, no Nf3: la lee el alumno, no el motor), ordenada por
jugadas para que las que empiezan igual queden juntas, y cómo va su repaso. La
escribe `js/reporte-pdf.js`, el mismo de los informes, con la marca de agua
pedida con su dirección vista desde `entreno/` (la de `MarcaAgua.preparar()`
es relativa a la raíz y desde ahí no se encontraba). Una línea que no se puede
jugar no va. El verificador baja el PDF y lee su texto con pypdf.

#### Jugar con mi repertorio

Cada color del árbol trae «▶ Jugar con mi repertorio»: una partida en la que,
mientras la posición esté en sus líneas, la computadora juega las jugadas del
RIVAL que el alumno preparó, y si él se sale de su línea le dice cuál era la
suya («En tu repertorio jugabas 1…c5»). Cuando el repertorio se acaba sigue
Stockfish, a la fuerza que se elige (de Elo 1350 a 2200).

- **Es «Juega contra él» de la preparación de rivales**
  (`js/preparacion-sparring.js`), no otra partida: el libro del rival se arma
  con sus líneas (`RepertorioAperturas.libroDe`, con la misma huella de
  posición, así que dos órdenes que llegan a lo mismo son lo mismo) y el plan
  es su árbol (`planDe`). Donde preparó dos respuestas del rival, sale una al
  azar.
- **Los textos cambian, lo que hace no.** El sparring aceptaba solo frases de
  rival real («la juega 63 % de las veces en sus partidas»), que acá serían
  mentira; ahora recibe `textos` opcionales. Sin ellos dice exactamente lo de
  antes — `verificar-preparacion-rivales.js` lo comprueba, y fue el que
  atrapó un «Te saliste de el plan» al generalizarlo.
- **Los scripts de la partida y Stockfish se bajan al apretar el botón**, no
  al abrir Aperturas: quien solo repasa no paga los megas del motor.

**Al tocarlo, correr `node herramientas/verificar-todo.js repertorio
aperturas-pagina`.** `verificar-repertorio.js` prueba las funciones con
chess.js y la página en un navegador: el árbol de cada color, la fila que no se
puede jugar, armar con clics y escribiendo, el aviso del choque (y que no se
guarde), lo que se guarda, entrenarla entera, «Volver», borrar ESA y su ficha
marcada, y el enlace `?linea=mi:<id>`. Rompiendo el choque o la marca de
borrada, salta.

## Ejercicios sin internet

`entreno/sin-internet.html` (tarjeta «📴 Ejercicios sin internet», en
Entrenamiento intermedio): con señal, el alumno guarda en el celular una tanda
de 10, 20 o 30 problemas del banco de Ejercicios por tema (partidas reales de
Lichess, ya comprobadas), de la dificultad que elija. Sin señal, abre la
página y la resuelve —con clics o escribiendo, con pista y «Ver solución»—, y
cada resultado se sube solo cuando vuelve la conexión.

- **La página se guarda en su PROPIA caché** (`ajedrez-integral-sin-red`), con
  ella misma —con y sin `.html`, porque Cloudflare redirige una a la otra— y
  todos sus scripts y hojas, sacados de la propia página: un script nuevo
  entra solo. `sw.js` no la borra al cambiar de versión (si no, la tanda de
  ayer no abriría hoy sin señal) y, sin red, busca la página con el otro
  nombre y rearma una respuesta redirigida, que Chrome no acepta para abrir
  una página.
- **Se vuelve a guardar cada vez que se abre con señal.** `sw.js` sirve la red
  primero para no juntar HTML nuevo con CSS viejo; una copia guardada una vez
  y nunca más sería justo eso. Así, sin red se abre la de la última vez que
  hubo señal, entera.
- **Lo que se sube es lo mismo que sube Ejercicios por tema**
  (`training_progress`, actividad «temas», con cómo salió), con la HORA en que
  se resolvió: si no, la racha y «Cómo viene» lo contarían el día que hubo
  señal. La base acota esa hora (trigger `training_progress_hora`): hasta 7
  días atrás, nunca adelante; fuera de eso vale la de la base. Antes
  `created_at` se aceptaba tal cual lo mandara el navegador, con cualquier
  fecha; ahora no, para nadie.
- **Un resultado no se cuenta dos veces.** Cada uno lleva su `sin_internet_id`
  y un índice único parcial de la base lo rechaza si ya estaba (se subió y la
  respuesta se perdió con la señal). Se sube de a uno y cada uno sale de la
  cola solo cuando la base lo aceptó, o cuando dijo que ya lo tenía.
- **Lo que costó entra en la cola de repaso** de Ejercicios por tema
  (`RepasoFallados`), igual que si lo hubiera resuelto allá; esa cola se sube
  con `js/progreso-usuario.js` cuando hay señal.
- **Sin señal no se puede preparar otra tanda**, y se dice; cambiar una tanda
  con ejercicios sin hacer pregunta antes. El tiempo conectado no se cuenta:
  `js/tiempo-plataforma.js` no lo cree por lo que diga el navegador, y sin
  red no hay con quién contarlo.

**Al tocarlo, correr `node herramientas/verificar-todo.js sin-internet`.**
Prepara una tanda, le corta la red al navegador (`setOffline`), la resuelve
con clics y escribiendo, comprueba que no se escriba nada sin señal y que, al
volver, se suba cada uno con su hora y su id, y que uno que la base ya tenía
salga de la cola sin contarse; y con el service worker de verdad, que la
página abra sin red con la tanda donde quedó. Comprobado en la base: 2 días
atrás se respeta, 30 días atrás y el futuro pasan a «ahora», y un
`sin_internet_id` repetido da 23505.

## Estudio: una ficha por idea, con su mapa y su posición

`entreno/estudio.html` (tarjeta **"📚 Estudio"** en `clases.html` → grupo
"Aprender") son 184 fichas de estudio: 27 aperturas, 31 defensas, 28 temas
tácticos, 24 mates, 49 conceptos y 25 finales. Cada una es **una sola pantalla**: la idea principal
arriba, cuatro bloques alrededor de un nodo con la pieza, y abajo la posición
que lo explica, recorrible jugada por jugada.

No es otra forma de `entreno/aperturas.html`, y por eso son dos páginas y no
una: Aperturas y celadas se **juega** de memoria con repaso espaciado, y una
ficha se **mira de un vistazo** — es lo que uno repasa cinco minutos antes de
jugar, o imprime y pega en el cuaderno. Las dos comparten el banco de líneas,
así que no hay dos versiones de la misma apertura.

### Antes esto eran DOS páginas, y eran la misma

Durante un tiempo convivieron `entreno/fichas.html` (las 56) y
`entreno/estudio.html` (las 24 de apertura y defensa, que son un subconjunto
exacto de las otras). Mismo banco, mismo mapa, mismo tablero, mismo botón de
practicar: **la misma página dos veces**, con dos listas que había que
mantener parejas y dos verificadores que comprobaban lo mismo. Se fusionaron
en Estudio y Fichas se borró.

- **La dirección vieja no murió: redirige.** `_redirects` manda
  `/entreno/fichas.html` a `/entreno/estudio.html` con un 301, y Cloudflare
  conserva la parte de `?ficha=<id>` — esos enlaces se compartían por
  WhatsApp, y un 404 no le dice a nadie a dónde ir. Es la misma decisión que
  se tomó con `entreno/tactica.html` al mudarse dentro de Ejercicios por tema.
- **La tarjeta del panel quedó en una sola.** Dos tarjetas que llevan a lo
  mismo con nombres distintos son el error que el panel ya cometió con
  "Torneos"; en Tareas (`js/material-plataforma.js`) pasa igual: un solo
  material asignable, "Estudio".
- **Sin pestañas, con un `<h2>` por categoría.** Las cuatro secciones van una
  debajo de otra: se salta de grupo en grupo con lector de pantalla y nadie
  tiene que elegir una pestaña antes de poder ver nada.
- Con 56 fichas el **buscador** sí hace falta, y mira las cuatro categorías a
  la vez, sin tildes ("peon pasado" encuentra todas las que hablan de él).
  Cuando hay búsqueda, lo que sobrevive se sigue pintando dentro de su grupo:
  el árbol de encabezados no cambia según lo que se escriba.

### Cómo es una ficha

- **Los cinco bloques están SIEMPRE y en el mismo lugar de la pantalla.** Sus
  títulos salen de `TITULOS[categoria]` (una apertura tiene Planes, Ideas
  tácticas, Medio juego y Final; un tema táctico tiene Cómo se reconoce, Quién
  la hace, Errores frecuentes y Cómo practicarla), así que dos fichas distintas
  se leen igual y el ojo ya sabe dónde buscar cada cosa. El verificador falla si
  una ficha trae tres bloques o seis.
- **El color no dice nada solo.** Cada bloque tiene el suyo —y las líneas que
  salen del nodo, también— pero el título va escrito y la categoría va en una
  etiqueta de texto: es la misma regla de los gráficos de Informes. Los
  renglones usan `--text-cuerpo` y no el gris de los textos secundarios, que
  contra el blanco de la caja se queda justo en el borde de 4.5.
- **Las líneas del mapa son un SVG con `preserveAspectRatio="none"`, y por eso
  cada una lleva `vector-effect="non-scaling-stroke"`.** Ese atributo **no se
  hereda del `<g>`**: puesto en el grupo, el navegador escala el grosor junto
  con el viewBox y las cinco líneas salen como cuñas de 15 px. Se ve raro pero
  no falla nada, así que solo se descubre mirando la pantalla.
- **El mapa y el tablero los pinta `js/ficha-render.js`**, que se sacó afuera
  cuando esto eran dos páginas. Quedó igual: es la pieza que sabe dibujar una
  ficha, y la página solo decide cuáles muestra.
- **La posición no se inventa nunca**, y sale de **una sola** de estas tres
  fuentes: `lineaId` (una línea de `js/aperturas-lineas.js` — las jugadas NO se
  copian: se leen de ahí, que es donde viven), `jugadas` propias desde el
  principio, o una `fen` de estudio con su `linea`. El verificador falla si una
  ficha trae dos.
### El motivo que promete la ficha se comprueba con el motor, no a ojo

Cada ficha declara en `comprueba` qué tiene que cumplirse en el tablero —que la
jugada dé jaque, que la línea termine en mate, que la pieza clavada no tenga
ninguna jugada legal, que el peón esté pasado de verdad, que la columna no tenga
un solo peón, que los dos alfiles sean de distinto color de casilla—, y
`herramientas/verificar-fichas.js` lo juega con chess.js. Es el mismo criterio
del material de los cursos y del banco del diagnóstico, y encontró dos errores
que en pantalla no se veían:

- El jaque descubierto ganaba una dama con `Cd7+`… solo que **el rey se comía el
  caballo**: estaba sin defender. El caballo se mudó a g6, donde no lo alcanza
  nadie.
- La clavada de la española **no es una clavada** mientras el peón negro siga en
  d7: la diagonal b5-e8 está tapada por él. La ficha ahora muestra la posición
  después de `3…d6`, y ese mismo hallazgo quedó escrito como error frecuente
  dentro de la ficha.

La comprobación fuerte es `ganaSiempre`: no alcanza con que la pieza **ataque**
dos cosas, se juegan **todas** las respuestas legales del rival y ninguna puede
salvar lo prometido. Una horquilla que se para con una jugada no es una
horquilla, y en el diagrama se ve igual de bien.

**Cuando una ficha dice «el tema X», ese X existe.** Los nombres salen de
`entreno/data/temas.json` —el mismo archivo que arma Ejercicios por tema— y el
verificador los compara contra él. Así se corrigieron cuatro: el tema de la
horquilla se llama ahí **«Pincho»**, el del descubierto **«Ataque a la
descubierta»** y el de la enfilada, **«Ataque por rayos X»**. Mandar a un alumno
a un tema que no está no da ningún error: lo busca, no lo encuentra y se queda
pensando que se equivocó él.

### La segunda tanda: de 28 a 56 fichas

Se duplicaron las cuatro pestañas (12 aperturas, 12 defensas, 16 temas tácticos
y 16 conceptos) sin tocar ni una de las 28 primeras. Lo que dejó escrito:

- **Tres aperturas nuevas entraron ANTES al banco de líneas.** La vienesa, el
  gambito Evans y el ataque indio de rey no estaban en
  `js/aperturas-lineas.js`, así que sus fichas nacieron con `jugadas` propias
  — y eso las dejaba sin el botón de practicar, que solo sale cuando la línea
  existe allá. En vez de dejar el botón afuera, las tres líneas se sumaron al
  banco (40 líneas ahora) y las fichas las leen de ahí: una sola fuente, y de
  paso tres líneas más para memorizar jugando. **Toda ficha de apertura o
  defensa tiene su `lineaId`**; las de táctica y conceptos pueden partir de
  una FEN de estudio.
- **El verificador volvió a atajar tres posiciones mal armadas**, las tres
  invisibles en pantalla:
  - el jaque doble salía con `Ch6+`… y desde g5 **un caballo no llega a h6**;
  - en la pieza atrapada, el alfil se comía el peón que venía a encerrarlo,
    porque ese peón no estaba defendido;
  - y el zugzwang no era zugzwang: al rey le quedaba una casilla de espera,
    así que mover no le costaba nada.
- **Los predicados nuevos de `comprueba`** siguen la misma idea —el motivo se
  juega, no se declara—: `materialGanado` (la combinación TERMINA con el
  material prometido), `defiendeDos` (la sobrecarga: esa pieza defiende de
  verdad las dos casillas), `dobleJaque` (al rival no le queda otra que mover
  el rey), `bateria`, `atrapada` (todas sus salidas la dejan donde la comen),
  `repeticion` (el perpetuo repite tres veces), `zugzwang` (no está en jaque,
  el rival no tiene ninguna captura y CUALQUIER jugada le regala una),
  `oposicion`, `torreDetras`, `cuadrado` (la cuenta de la regla, con el salto
  doble incluido), `alfilMalo`, `aislado`, `ahogado` y `peonesEn`.
- De paso, `herramientas/verificar-aperturas-pagina.js` tenía su doble de
  Supabase sin `insert()`: desde que esa página apunta la línea terminada en
  `training_progress`, terminar una línea tiraba un TypeError en la consola y
  el verificador lo contaba como fallo. Era el doble el que estaba incompleto,
  no la página.


### La tercera tanda: de 56 a 98 fichas, y los finales

Entraron 42 fichas (6 aperturas, 7 defensas, 11 tácticas, 8 conceptos) y una
quinta categoría, **Finales** (10), con sus títulos de bloque propios: «Cuándo
aparece», «Cómo se juega», «Errores frecuentes», «Para practicarlo». Lo que
dejó escrito:

- **Ninguna posición se inventó.** Las de apertura y defensa salen de líneas
  del banco: diez líneas nuevas entraron a `js/aperturas-lineas.js` (50 en
  total: Colle, Alapin, Trompowsky, Réti, catalana, gambito escocés, Philidor,
  gambito de dama aceptado, semieslava y Benoni moderna), así que todas
  tienen su botón de practicar; las de los dos caballos, Alekhine, holandesa,
  Légal y el pastor reusan líneas que ya estaban. Seis tácticas salen de la
  base abierta de Lichess que ya usa Ejercicios por tema (el id va al lado de
  cada `fen`), eligiendo el ejercicio más corto, de rating más bajo y con
  menos piezas de cada tema. El molino, el sacrificio griego y todas las de
  finales se armaron y se comprobaron con Stockfish 16.
- **Lo que promete una posición lo confirma un motor**: el campo `promete`
  ("mate", "gana" o "tablas", desde el bando que mueve) lo revisa
  `herramientas/fichas-motor.js`. NO se llama `verificar-*` porque el CI no
  tiene Stockfish y fallaría siempre: se corre a mano al tocar una ficha que
  lo trae. Pide, además del resultado, que la primera jugada de la línea no
  tire la ventaja (la Lucena se gana con Td1+ aunque el motor prefiera Tc7+)
  y que un mate prometido sea forzado.
- **El motor acepta posiciones imposibles.** La primera versión del mate de
  alfil y caballo tenía al rey negro en jaque con las blancas al mover: Stockfish
  la analizó sin quejarse y la cazó `verificar-fichas.js` («el bando que no
  mueve está en jaque»). Por eso chess.js va primero y el motor después.
- **Comprobaciones nuevas en `verificar-fichas.js`**: `kpk` (rey y peón contra
  rey, con el oráculo exacto de `herramientas/lib/kpk.js`, que arma la tabla
  entera en 0,3 s y sí corre en el CI), `alfilesDistintos`, `ahogadoFinal` y
  `triangulo` (tras las cinco primeras jugadas de la línea las piezas vuelven
  a su lugar con el turno cambiado). Las cinco se rompieron a propósito y
  saltan.
- **La triangulación se buscó con el motor** entre finales de peones trabados:
  con negras al mover pierden; con blancas, la jugada natural (Rg5) empata y
  el triángulo h6-h5-g5 gana. También gana Rh7, que es otra forma de perder el
  tiempo: la ficha enseña el triángulo y no promete que sea la única.
- **«Pieza buena y pieza mala» no promete resultado**: el motor da 0,00 (con
  todo cerrado, el caballo bueno no gana solo) y la ficha lo dice en «En el
  final». Lo que sí comprueba es que el alfil sea malo y la casilla fuerte.
- La quinta categoría tiene su tarjeta en el panel del alumno («🏁 Finales»,
  `?cat=final`), su entrada en el buscador de `clases.html`, en
  `data/contenido-panel.json` y en `entreno/data/metas.json`. En el papel
  lleva su color (#5b3e8a, 8,4:1 contra blanco en los dos sentidos) y el
  índice del libro pasó a dos páginas, partido por categorías enteras.
- «Escocés» y «París» terminan como un voseo (tenés, decís) y no lo son: van
  en la lista blanca de `verificar-voseo.py`.

### La cuarta tanda: de 98 a 126 fichas

Entraron 28 fichas para los temas importantes que faltaban: 4 aperturas
(siciliana abierta, Smith-Morra, cuatro caballos, gambito danés), 3 defensas
(Berlín, inglesa simétrica, Benko), 7 tácticas (pieza colgada, cómo
defenderse, sacrificio de calidad, jugada tranquila y los mates árabe, de las
hombreras y de Morphy), 8 conceptos (cómo armar un plan, torre en séptima,
enroques opuestos, mayoría de peones, casillas débiles de un color, peones
colgantes, jugadas candidatas, el reloj) y 6 finales (peón pasado alejado,
torre contra peón, la ruptura de los tres peones, cortar al rey con la torre,
caballo contra peón, alfil contra caballo).

- **Siete líneas nuevas** en `js/aperturas-lineas.js` (57 en total), así que
  las siete fichas de apertura y defensa tienen su botón de practicar. Todas
  se miraron con Stockfish: salen parejas, menos el danés, que da +1 al negro
  con juego correcto (lo dice la ficha: si el ataque no da nada, el negro
  gana con los peones de más).
- **Las tácticas salen de Lichess** (el id al lado de la `fen`; cuando la
  base no trae el id del ejercicio, el de la partida). El mate de las
  hombreras se cambió por uno de forma clásica —rey en d8 con su torre y su
  caballo a los lados—: el primero que salió tenía una sola «hombrera».
- **«Cómo defenderse» no promete resultado**: el motor da +1,2 tras la única
  defensa (Rxf2), y las otras dos pierden. Lo que comprueba (`enJaque`) es que
  haya un jaque cuyas respuestas comparar. **«Jugadas candidatas» tampoco**
  promete «gana» (+2,25, debajo del +3 que pide `fichas-motor.js`); comprueba
  el jaque y el material al terminar la línea.
- **Una mayoría con un peón de más no enseña la mayoría**: la primera posición
  daba +4,4 porque el blanco tenía un peón más. La de la ficha tiene cinco
  contra cinco, y la comprobación `mayoria` exige los peones parejos.
- **Las posiciones del motor que estaban mal planteadas se cambiaron**: la de
  casillas débiles daba +10 porque dejaba una torre colgada (ahora es el
  «ataque 150», Ah6 contra el fianchetto), y cortar al rey con la torre contra
  un rey solo no enseña nada; contra torre y con el peón en b2, el motor dio
  tablas: la de la ficha tiene el peón en b4 y gana.
- **El motor se cae con una posición ilegal y no avisa**: dos candidatas de
  caballo contra peón tenían al rey negro en jaque del caballo con las blancas
  al mover; Stockfish no contestó y el script terminó sin escribir nada. Igual
  que en la tercera tanda: chess.js primero.
- **Comprobaciones nuevas en `verificar-fichas.js`**: `enJaque`, `septima`
  (la torre en su séptima, con el rey rival en la octava o dos peones ahí),
  `enroquesOpuestos`, `mayoria` y `sinAlfil` (sin el alfil de un color de
  casilla). Se rompieron a propósito y saltan.
- El libro pasó a 136 páginas (el índice, a tres) y las cartas a 14 hojas.

### La quinta tanda: de 126 a 152 fichas

Entraron 26 fichas: 8 finales (peones ligados, oposición lejana, la
fortaleza, torre contra alfil, torre contra caballo, dama contra torre,
mate con rey y dos alfiles, alfil bueno contra alfil malo), 7 conceptos (el valor de las piezas,
cómo atacar al rey enrocado, el peón retrasado, el bloqueo, la columna
semiabierta, convertir la ventaja, la coordinación de las piezas), 6 tácticas
(el ataque a f7, la coronación, los mates de los dos alfiles y de Damiano, el
rey expuesto, el sacrificio en h6; los dos mates pasaron después a Mates), 1 apertura (Stonewall) y 4 defensas
(Najdorf, Winawer, moderna, Budapest).

- **Cuatro líneas nuevas** en `js/aperturas-lineas.js` (61): Winawer, moderna,
  Stonewall y Budapest. La Najdorf ya estaba como línea y le faltaba la ficha.
  **La primera Stonewall regalaba la dama**: con el alfil negro en g4, Ce5
  destapaba la diagonal g4-d1 (el motor dio +6 al negro). Se cambió el orden
  de jugadas; chess.js no ve eso: las jugadas eran todas legales.
- **La oposición lejana se buscó con el oráculo de rey y peón**: entre todas
  las posiciones ganadas, las que tienen UNA sola jugada que gana, que es de
  rey y deja a los reyes en la misma columna con un número impar de casillas
  en medio. La de la ficha es Rf2, con cinco casillas entre f2 y f8.
- **Dama contra torre no llegaba al +3 a profundidad 20** en la primera
  posición (+2,95, aunque es teoría ganada): la de la ficha da mate en 9 y
  `fichas-motor.js` lo confirma. Lo mismo con el final de alfiles del mismo
  color: las tres posiciones probadas dan entre 0 y +0,4, así que la ficha
  no promete resultado; lo que comprueba es que los alfiles sean del mismo
  color y que el negro sea el malo.
- **Damiano no tiene tema en Lichess**: el ejercicio se buscó por la figura
  (dama que da mate en h7 sostenida por un peón en g6) y la ficha manda a
  practicar «Mate en 1».
- **Comprobaciones nuevas en `verificar-fichas.js`**: `lejana`, `cuenta` (el
  material del diagrama, en peones), `retrasado` (sin vecinos a su altura o
  atrás y la casilla de adelante atacada por un peón rival), `bloquea`,
  `semiabierta` y `alfilesIguales`. Se rompieron a propósito y saltan.
- **«Las casillas clave» se sacó antes de entrar**: ya es el subtítulo de «Rey
  y peón contra rey», que las enseña. En su lugar entró torre contra caballo.
  Antes de sumar una ficha, buscar el tema también en los subtítulos.
- El libro pasó a 162 páginas y las cartas a 17 hojas.

### Los mates, en una pestaña propia

Con 24 fichas de mate repartidas entre Táctica y Finales, el dueño de la
Academia pidió juntarlas. Entró la sexta categoría, **Mates** («las figuras
que hay que conocer»), con sus títulos de bloque: «Cuándo aparece», «Cómo se
da», «Errores frecuentes», «Cómo practicarlo».

- **Qué se movió**: los 20 mates con nombre que estaban en Táctica (del
  pasillo al de Cozio) y los cuatro básicos que estaban en Finales (rey y
  dama, rey y torre, rey y dos alfiles, alfil y caballo). Los ids no cambian:
  los enlaces `?ficha=` siguen funcionando.
- **El orden lo da el banco**: la pestaña muestra las fichas en el orden de
  `js/fichas-estudio.js`, así que los cuatro básicos se movieron antes del
  primer mate con nombre, de más fácil a más difícil.
- **Dónde se nota**: la tarjeta «♚ Mates» en el grupo Aprender del panel del
  alumno (`?cat=mate`), su entrada en el buscador, en
  `data/contenido-panel.json` y en `entreno/data/metas.json`. En pantalla,
  como Táctica, Conceptos y Finales, va con el color de línea neutro; en el
  papel lleva su color (#a01a6b, 7,4:1 contra blanco) y su portadilla, así que
  el libro tiene 196 páginas.

### La sexta tanda: de 152 a 184 fichas

Entraron 32 fichas: las reglas que no tenían ficha (la captura al paso, el
enroque y cuándo no se puede, las tablas), 5 finales (la carrera de peones, el
peón pasado protegido, el alfil del color equivocado, torre contra dos peones
ligados, la posición de Vancura), 7 conceptos (recapturar hacia el centro,
mantener la tensión, el fianchetto, el caballo en el borde, la compensación,
cómo evaluar una posición, el centro móvil y el fijo), 8 mates con nombre (de
la Ópera, del cerdo ciego, de Pillsbury, del gancho, de la esquina, de dama y
alfil, cola de golondrina, de Cozio) y 9 aperturas y defensas (Ponziani,
apertura del alfil, Bird, Grand Prix, Sveshnikov, Kan, Bogoindia, india
antigua, holandesa Leningrado), con sus nueve líneas nuevas (70 en total).

- **El mate de la Ópera sale de la partida de verdad** (Morphy, París 1858):
  la posición se armó jugando las 16 primeras jugadas con chess.js, no se
  copió de memoria. Los otros siete mates salen de Lichess.
- **La carrera de peones se buscó con el motor**: con el rey negro fuera de la
  diagonal a8-h1, los dos peones coronan y la dama blanca se come la negra por
  esa diagonal. Solo a6 gana: la jugada de rey pierde.
- **Las reglas se comprueban como reglas**: `alPaso` (la jugada es captura al
  paso, con la casilla en la FEN), `enroque` (qué enroques son legales en la
  posición) e `insuficiente` (chess.js dice que no hay material para mate).
  Además entraron `protegido`, `alfilEquivocado`, `tension`, `piezaEn` y
  `vacias`. Todas se rompieron a propósito y saltan.
- **Los pies nuevos se leyeron con el tablero al lado** antes de entrar, como
  pide la sección de abajo: dos decían algo falso (el alfil de b3 «apuntando a
  f7» con el peón de d5 en medio, «todas las piezas afuera» con el alfil de c8
  en su casa) y diez quedaban flojos; se corrigieron todos.
- **El índice del libro ya no entraba**: Táctica sola tiene 48 títulos y cada
  categoría estaba marcada para no partirse, así que no cabía en una columna
  de 35. Ahora una categoría puede seguir en la otra columna de la misma
  página (el título no se separa de sus primeras líneas). El libro tiene 195
  páginas, con el índice en cuatro, y las cartas, 21 hojas.

### El pie de cada diagrama, revisado contra su tablero

El pie del diagrama es lo que oye quien no ve el tablero y lo que lee quien
imprime la ficha. Se revisaron los 152 pies contra su posición, y 32 decían
algo que el tablero no muestra. Ninguno daba error: la ficha se veía bien.

- **Una línea estaba mal**: en «Mate con rey y dama», Dh7+ dejaba la dama sin
  defensa (el rey blanco en f6 no llega a h7) y el negro se la comía. El motor
  confirmaba «mate» porque mira la posición, no la línea de la ficha. Ahora es
  Dh5 Rf8 Df7#, con Rf8 forzada.
- **Lo que más se repetía**: ataques tapados (la dama de b6 no ataca d4 con
  su peón en c5; el alfil de b2 no llega a g7 con el caballo en c3), jugadas
  contadas en otro orden o en otro tiempo («lo va a echar con d3» cuando d3
  ya se jugó), un peón llamado aislado que todavía tenía vecino, y cifras de
  más («la única columna abierta», «tres piezas» cuando el alfil ya se había
  entregado).
- **Lo que quedó fijo en `verificar-fichas.js`**: toda «<pieza> de|en
  <casilla>» del pie tiene que estar en alguna posición de la ficha (la
  mostrada o alguna de la línea). Cazó dos pies al estrenarse y uno más que
  se escribió durante la revisión. Lo demás (ataques, enroques, material)
  no se puede comprobar con una expresión regular: al escribir un pie nuevo,
  leerlo con el tablero al lado.

### Lo demás que hace la página

- **Cada ficha tiene su enlace** (`estudio.html?ficha=<id>`), para mandarla por
  WhatsApp. Un id que ya no existe cae a la lista, no a una ficha en blanco.
- **Se imprime, y en UNA hoja.** Una hoja de estilos de impresión deja solo la
  ficha —sin encabezado, sin lista, sin buscador, sin botones— y la arma como
  un mapa de ideas: la idea principal a lo ancho, el tablero en el medio como
  eje con un medallón encima, y los cuatro bloques a
  los costados, cada uno con su flecha de su color (y su título escrito: el
  color no dice nada solo). En el papel, el medallón del centro —de donde
  salen las flechas— lleva el sello de Ajedrez Integral
  (`img/logo-oscar-angulo-marca.png`) en vez de la pieza; se probó primero de
  marca de agua y el dueño lo prefirió ahí. En la esquina va el logo del
  encabezado: el de la academia si la cuenta es de una
  (`js/marca-academia.js`), el de Ajedrez Integral si no, y el nombre de la
  academia si no tiene logo. Se copia cuando cambia el encabezado, no al
  imprimir: una imagen que se empieza a pedir al imprimir no llega al papel.
  - **El tablero se partía entre dos hojas** (la mitad de arriba en una, el
    resto con el pie en la otra). Tres causas juntas: las áreas del mapa solo
    se nombraban en pantalla ancha, nada le prohibía al tablero cortarse, y
    las coordenadas de afuera se quedaban donde estaban en la pantalla y
    empujaban una hoja más. Esto último valía para cualquier tablero impreso:
    lo arregla `js/coordenadas-tablero.js` (las esconde en `beforeprint` y
    las recoloca en el aviso de `matchMedia("print")`, que en Chrome corre con
    la maqueta de la hoja ya armada; el ResizeObserver y el cuadro siguiente
    no llegan a correr antes de que salga el papel).
  - `.mapa` pasa a `display:contents` en el papel, así el tablero (que en el
    HTML va después del mapa) queda en la misma cuadrícula que los bloques sin
    cambiar el orden del DOM, que es el que lee el lector de pantalla.
  - **Las flechas se trazan midiendo** (`trazarFlechas()` en
    `js/entreno-estudio.js`), en pantalla y en el papel: eran líneas fijas en
    porcentajes, y con dos maquetas distintas apuntaban al vacío en una.
  - En pantalla la ficha abre en la posición de salida; **al imprimir va al
    final de la línea**, que es la que describe el pie (si se fue a una jugada,
    se imprime esa), y al terminar vuelve.
  - En el papel van siempre los colores del modo claro: los de oscuro son
    pálidos y en blanco no se leen.
- **Las fichas en papel: el libro y las cartas.** `herramientas/fichas-estudio-pdf.js`
  arma en `material/fichas-de-estudio/` (que el worker solo le sirve a
  administración y a quien lo compre):
  - `fichas-de-estudio-libro.pdf`: tapa, presentación, índice con el número
    de página de cada ficha, una portadilla por categoría y una ficha por
    página, en hoja carta. **Las páginas de ficha son la ficha impresa de esta
    página, tal cual**: se abre `estudio.html?ficha=…` y se imprime, con el
    número al pie. Una segunda maqueta del mapa se iría separando de la
    primera; por eso el generador necesita el sitio levantado en el 8777.
  - `fichas-de-estudio-cartas.pdf`: cartas de 63 × 88 mm (las de juego), nueve
    por hoja carta, pegadas y con marcas de corte en el margen. Frente: título,
    tablero (con coordenadas, de `herramientas/lib/tablero-svg.js`, que
    prometía la opción y no la tenía) e idea principal; reverso, los cuatro
    bloques. Las hojas van frente, reverso, frente… y el reverso en espejo,
    para imprimir a doble cara volteando por el borde largo. Cada carta deja
    3 mm de aire por dentro por si el corte o la doble cara se corren. El
    texto se achica solo hasta que entra y no baja de 5,6 pt: si una carta no
    entrara ni así, el generador se detiene en vez de imprimirla cortada.
  - En los dos, el tablero muestra el final de la línea, como al imprimir.
    La versión accesible es la propia página, que se lee entera con lector de
    pantalla.
  - **Se venden en la tienda** como «Las fichas de estudio en papel»
    (`fichas-de-estudio` en `js/tienda-catalogo.js`, el mismo nombre que la
    carpeta, que es por lo que pregunta el candado). Las fichas, páginas y
    cartas que promete la ficha de la tienda las compara
    `verificar-fichas-pdf.py` con el banco y los PDF.
  - **Se bajan desde la lista de Estudio**, en el recuadro «Las fichas en
    papel», que ve quien administra y quien las compró: a cualquier otra
    cuenta el worker se las niega, así que ofrecérselas sería un enlace que da
    «se compra aparte». Para quien no administra la página hace la MISMA
    pregunta que el worker, `puede_bajar('fichas-de-estudio', false)` (sin
    que baste el acceso a la Academia). Respeta «Ver como»
    (`ModoVista.perfilVisto`): quien administra mirando como alumno o como
    profesor no lo ve. `verificar-estudio.js` lo comprueba con las cuatro
    cuentas y con la pregunta exacta.
  - **Al tocar el banco de fichas o la ficha impresa, se vuelve a generar.**
    `verificar-fichas-pdf.py` lo nota: cuenta las páginas contra el banco y
    busca cada título en la página que dice el índice y en las dos caras de
    su carta (renombrar una ficha sin regenerar lo hace saltar).
- **El tablero es cuadrado, con las ocho filas iguales** (también en
  Aperturas y en Repasar clases). Con `grid-template-rows: repeat(8, 1fr)`
  una fila no puede ser más chica que lo que trae adentro, y las casillas
  heredaban el interlineado de 1,5 del sitio: con la pieza a 27 px el renglón
  medía 41 px en una casilla de 38. En el celular las filas con piezas
  crecían y el tablero salía estirado (38×41 en Estudio y Aperturas, 310×332
  en Repasar clases) y la ficha impresa de la Española salía de 232×268. Se
  veía «más o menos bien» y nadie lo notaba. El arreglo es
  `repeat(8, minmax(0,1fr))` y `line-height:1` en la casilla.
  `verificar-tablero-cuadrado.js` mide esos tableros en cuatro anchos (360,
  390, 768 y 1280 px) y `verificar-estudio.js` cada ficha impresa; un tablero
  nuevo que copie la regla vieja va en `PAGINAS` del primero.
- **El tablero es decorativo** (`aria-hidden`): el pie cuenta qué se ve y la
  posición va contada pieza por pieza con `BlindNotation.positionSentence()`,
  que es la única tabla de nombres y plurales del sitio — escribirla otra vez
  acá sería la quinta copia. En Modo Adaptado esa lectura se agranda, y lo
  decide el CSS, no el JavaScript.
- El botón de practicar **solo sale cuando esa línea existe** en el banco de
  `entreno/aperturas.html`, y dice de qué color se juega: las fichas de
  apertura y defensa siempre la tienen; las de táctica y conceptos pueden
  partir de una FEN de estudio y ahí el botón no aparece. La misma línea se
  practica de un lado solo (el gambito de dama está en el banco desde el lado
  del negro, aunque la ficha sea de aperturas).
- **No lleva marca de progreso ni clave en `js/progreso-usuario.js` a
  propósito.** No hay nada que sincronizar entre aparatos porque no hay ningún
  "resuelto" que guardar: la memorización de verdad, con su repaso espaciado,
  vive en `entreno/aperturas.html`. El tiempo sí se registra, como en toda
  página de Entreno: `js/tiempo-plataforma.js data-activity="estudio"`.
- Se puede asignar desde Tareas: está en `js/material-plataforma.js`.

**Al tocar el banco o la página, correr las dos comprobaciones**:

    node herramientas/verificar-fichas.js     # el banco, con chess.js
    node herramientas/verificar-estudio.js    # la página, en un navegador

La primera no necesita más que `npm install chess.js@0.10.3`. La segunda pide
además playwright y el sitio en localhost:8777, y existe porque esta página está
detrás del login: `verificar-css.js` abre las páginas sin cuenta y no ve nada de
esto. Comprueba que estén las cuatro secciones con sus fichas y en orden, que
cada bloque traiga SUS renglones y no los del de al lado, que el tablero dibuje
**pieza por pieza** la posición que toca en cada jugada (contra chess.js, no
contra lo que diga la página), que el buscador mire las cuatro categorías, que
el enlace `?ficha=` abra la ficha y que un id inventado caiga a la lista, que
**la regla de `_redirects` siga mandando la dirección vieja de Fichas acá**, que
al imprimir salga la ficha y no la lista —como mapa, con sus cinco flechas, el sello en el medallón, el logo de la academia en la esquina y la posición final de la línea—, que **las 56 fichas quepan en una hoja carta y en una A4** (las imprime en PDF y cuenta las hojas), y que la página **se vea**: sin CSS
impreso como texto, con una sola hoja, y en oscuro cuando el tema está en
oscuro. Absorbió todo lo que comprobaba `verificar-fichas-pagina.js`, que se fue
con la página.

- De paso se le quitó la fecha fija a `herramientas/verificar-panel.js`: sus
  clases de mentira colgaban de un día escrito a mano y el filtro de "últimos 3
  meses" se mide contra hoy, así que la prueba se iba pudriendo sola —fallaba
  por el almanaque, no por el código—. Ahora cuelgan de hoy y los meses
  esperados se calculan de las mismas filas.

## El Evaluador de precisión posicional: elegir el plan, no la táctica

`entreno/precision-posicional.html` (tarjeta **"🧭 Precisión posicional"** en
el grupo "Entreno" del hub de Entrenamiento) es un banco de 96 posiciones
—12 por cada una de 8 áreas— con una pregunta de opción múltiple por posición.
**Ninguna tiene una jugada que gane material o dé mate de inmediato**: lo que
se pide es el plan correcto a largo plazo — mejorar la pieza peor colocada,
abrir o disputar una columna o diagonal, decidir qué cambiar y qué conservar,
fijar y atacar una debilidad, sostener una ventaja de espacio, elegir el
flanco de ataque, decidir sobre la estructura de peones, o transformar una
ventaja rumbo al final.

Es la primera herramienta del sitio que entrena juicio posicional puro, y por
eso se parece y se diferencia del resto de los bancos a la vez:

- **El banco (`js/precision-posicional-items.js`) y el criterio
  (`js/precision-posicional-criterio.js`) van separados**, la misma partición
  que ya usan `js/diagnostico-items.js` + `js/plan-entrenamiento.js` y
  `js/arbitraje-items.js` + `js/arbitraje-nivel.js`: el criterio (qué mide
  cada área, qué repasar) se puede ajustar sin tocar las 96 posiciones, y al
  revés.
- **De las 96, 24 están escritas a mano y 72 son sus ESPEJOS geométricos**
  —columnas invertidas, filas invertidas con los colores cambiados, y las dos
  cosas juntas—, generados con una función pura que aplica la MISMA
  transformación al FEN y al texto (casillas, columnas, «ala de rey»/«ala de
  dama», el lado del enroque, blancas/negras, claras/oscuras). Escribir los
  72 espejos a mano es justo donde se coló el primer intento: confundir una
  casilla con otra al invertir filas, o de qué lado queda el plan después de
  cambiar los colores. La transformación mecánica no puede cometer ese error
  —o calcula bien la casilla, o `herramientas/verificar-precision-posicional.js`
  la delata (posición ilegal, en jaque, o con mate en una disponible)— y evita
  escribir 72 diagramas nuevos, que además serían menos variados que espejar
  los 24 ya pensados con cuidado.
- **Sin cronómetro, a propósito.** Un ejercicio de táctica se cronometra
  porque la solución tiene que verse rápido o no vale; acá es justo lo
  contrario — la idea completa del entrenamiento es dar el tiempo que haga
  falta para pensar el plan, no premiar a quien contesta rápido. La página no
  trae ningún reloj, ni de cuenta regresiva ni de cuenta corrida.
- **Ninguna posición se presenta como si fuera de una partida real.** Son
  posiciones ilustrativas, escritas a mano para mostrar con claridad un solo
  motivo estratégico clásico — el mismo criterio de cualquier manual de
  estrategia: un diagrama instructivo no necesita salir de una partida
  concreta. Lo que este repositorio no puede repetir es el error que ya
  cometió una vez con una «Lucena» que no era Lucena: prometer un resultado
  que el motor no confirma. Acá no hay ningún resultado que prometer —es un
  juicio posicional, no una combinación forzada—, así que el campo `fuente`
  de cada ítem describe el TIPO de estructura ("peón aislado de dama",
  "estructura Carlsbad") y **nunca** atribuye la posición a una partida ni a
  un jugador: inventar esa cita sería peor que decir con todas las letras que
  la posición es ilustrativa.
- **No hay ningún "nivel" ni título que estimar**, al revés que el
  diagnóstico o el examen de arbitraje. No existe un "elo posicional" que se
  pueda medir con un puñado de preguntas; lo único honesto que `resumir()`
  calcula es cuánto se acertó, por área, y un veredicto en palabras —nunca un
  número que suene más preciso de lo que en realidad es.
- **Dos tandas, no una.** "Ronda corta" (`PrecisionPosicionalPrueba.armar(1)`)
  sortea una posición de cada una de las 8 áreas; "Banco completo"
  (`armar()`, sin argumentos) trae las 96. Las dos se barajan, así que dos
  rondas seguidas no salen en el mismo orden.
- **El resultado se guarda en `training_state`** (claves
  `precision_posicional_resultado_v1` / `_historial_v1`), exactamente como el
  examen de arbitraje: esa tabla ya tiene su RLS (cada quien ve lo suyo) y no
  hace falta ninguna tabla nueva. Además, cada tanda terminada escribe una
  fila en `training_progress` (`'precision-posicional'`, ver «Precisión, el
  Sonar y Batalla naval también cuentan»). El tiempo se registra, como en
  toda página de Entreno: `js/tiempo-plataforma.js
  data-activity="precision-posicional"`.
- **El cuadro de comandos (`js/cuadro-comandos.js`) reutiliza `comandos.
  posicion(juego)`** para la lectura de la posición en Modo Adaptado, en vez
  de escribirla de nuevo: acá SÍ hay una partida de chess.js detrás de cada
  pregunta —cosa que el examen de arbitraje no tiene—, así que la misma
  lectura que ya usan Mates, 4×4 y el resto sale gratis. El tablero en sí es
  **decorativo** (`aria-hidden`, dibujado con `window.ExampleBoard.render()`,
  el mismo diagrama de los artículos y de las fichas de Estudio): quien usa
  lector de pantalla no necesita verlo, lo lee.
- **La corrección llega al final, posición por posición**, como el examen de
  arbitraje y no como Mates o 4×4 (que corrigen al toque): acá se está
  evaluando un criterio, no entrenando reflejos, así que ver la respuesta
  antes de terminar la ronda entera invalidaría las preguntas que faltan.

**Al tocar el banco, el criterio o la página, correr las dos comprobaciones**:

    node herramientas/verificar-precision-posicional.js               # el banco, con chess.js
    node herramientas/verificar-precision-posicional-pagina.js         # la página, en un navegador (sitio en localhost:8777)

La primera no necesita navegador ni red (`npm install chess.js@0.10.3`) y
comprueba lo único que SÍ se puede verificar de un banco sin táctica: que
**ninguna jugada legal de ninguna posición dé jaque mate** —si la hubiera, la
premisa entera ("acá no hay táctica inmediata, hay que pensar el plan") se
caería—, que la FEN de cada ítem sea legal y el turno declarado coincida, que
la posición no esté ya en jaque, que las cuatro opciones no se delaten por el
largo, que `fuente` diga siempre "Posición ilustrativa" y nunca invente una
cita, y que el banco alcance para las 8 áreas del criterio (y al revés, que el
criterio no describa un área sin ninguna posición).

La segunda pide playwright y el sitio en `localhost:8777`, y existe porque
esta página está detrás del login: `verificar-css.js` abre las páginas sin
cuenta y no ve nada de esto. Comprueba que sin sesión mande a `login.html`,
que la ronda corta arranque con 8 posiciones y el banco completo con 96, que
el tablero dibuje de verdad 64 casillas con piezas (no un tablero vacío), que
"Siguiente" avance y "Anterior" conserve la respuesta ya marcada, que el
resultado muestre el marcador y las 8 filas por área, y que terminar la ronda
guarde de verdad en `training_state` **a nombre del alumno de la sesión** —la
misma trampa que otros verificadores del sitio ya documentaron: anotar la
escritura en el resolver y no en el método, para no dar por buena una que
fuera a la fila que no era.

## Diagnóstico y plan de entrenamiento

`entreno/diagnostico.html` es la asignación de nivel (ficha "Asignaciones" en
Aprende). El banco de ítems está en `js/diagnostico-items.js`, verificado con
chess.js. El criterio pedagógico —áreas, nivel estimado y plan de 4 semanas—
está en `js/plan-entrenamiento.js` y lo comparten el alumno (al terminar) e
`informes.html` (informe del profesor). Si se tocan las posiciones, hay que
volver a verificarlas con chess.js: cada ítem dice en `prueba` qué debe cumplir.

- **El banco es más grande que la prueba**: cada diagnóstico sortea sus
  preguntas con `DiagnosticoPrueba.armar()` (al final de
  `js/diagnostico-items.js`). Lo que nunca cambia es la forma: desde la versión
  5, 60 ítems con la cuota fija de `FORMA` por área y por escalón (199 puntos),
  para que dos diagnósticos del mismo alumno se puedan comparar aunque las
  preguntas hayan sido otras (ver «Versión 5: 60 preguntas y la fuerza en
  puntos Elo»).
  Los ids de la prueba quedan guardados en el estado (para retomarla) y en el
  resultado (`detalle.items`, para que la corrección repase esas preguntas y no
  otras).
- **Hasta la versión 4, el nivel salía de los escalones de dificultad** (desde
  la 5 sale de la fuerza en puntos: ver «Versión 5»). El
  `peso` de cada ítem (1 a 5) es su escalón, y cada prueba lleva 1+2+2+1+1 por
  área (cuota en `FORMA`): ocho preguntas de cada escalón difícil en la prueba
  entera. El nivel estimado es **el escalón más alto superado** —60% de
  aciertos ahí y el promedio de los anteriores también en 60%—, con un tope: si
  un área quedó por debajo del 30% no pasa de Avanzado, y por debajo del 50% no
  pasa de Avanzado (nadie con los finales en blanco es «muy avanzado»). Está en
  `nivelPorEscalones()` de `js/plan-entrenamiento.js`.
  Por qué: con el porcentaje a secas, un jugador de 1400 y uno de 2300 sacaron
  los dos "Experto" (93% y 99%), porque el techo de la prueba eran preguntas de
  club. Al agregar ítems hay que respetar el `peso` — y si es de escalón 4 o 5,
  que sea difícil de verdad y **sin opciones falsas absurdas**, o el techo se
  vuelve a caer.
- **Ninguna opción puede delatarse por el largo.** La respuesta correcta era
  la más larga en 91 de 96 ítems: se aprobaba media prueba eligiendo la más
  larga, sin saber ajedrez. Ahora las cuatro opciones de cada ítem miden
  prácticamente lo mismo (la correcta nunca gana por más de 2 caracteres) y la
  explicación va en `explica`, no dentro de la opción.
- **Los ítems de tablero se responden con UNA jugada**, incluidos los mates en
  dos o en tres: se pide la jugada clave, no la secuencia. La página lo dice
  antes de mover ("se responde con una sola jugada") y al mover ("no hace falta
  jugar más"), y el enunciado de esos ítems lo repite; si no, el alumno juega
  la primera, no pasa nada y se queda sin saber si tiene que seguir.
- `herramientas/verificar-diagnostico.js` comprueba todo esto de una corrida
  (ids repetidos, posiciones ilegales, soluciones que no son legales, los mates
  forzados en la cantidad exacta de jugadas y con clave única, el largo de las
  opciones y que el banco alcance para la cuota). Necesita chess.js instalado
  aparte: `npm install chess.js@0.10.3 && node
  herramientas/verificar-diagnostico.js`. **Al tocar el banco, correrlo.**
- Los resultados viejos (sin `detalle.dificultad`) siguen calificándose por
  porcentaje con los umbrales de entonces: se midieron con otra prueba y no se
  vuelven a etiquetar. Una prueba empezada con una versión anterior no se
  puede continuar (`VERSION` en `entreno/diagnostico.html`): se descarta con un
  aviso, porque mezclaría dos mediciones distintas.

- Cada pregunta ofrece **"🤔 No lo sé todavía"**, siempre al final y con otra
  pinta. Vale cero puntos igual que fallar, pero se guarda aparte (`nosabe` por
  ítem y por área): para el profesor no es lo mismo un error —algo mal aprendido
  que corregir— que un hueco que enseñar, y evita que el alumno adivine y salga
  con un plan que no le sirve. Aparece en el resultado del alumno, en Informes y
  en el cuadernillo impreso.
- El resultado se guarda en `training_progress` con `activity = 'diagnostico'`.
  Esa tabla tiene un **CHECK con la lista de actividades permitidas**: si se
  inventa una actividad nueva y no se agrega ahí, la base rechaza la fila y el
  alumno no se entera (así se perdieron los primeros diagnósticos, que nunca
  llegaron a Informes). La página ahora guarda **antes** de pintar el
  resultado, dice la verdad cuando no pudo subirlo y lo deja apuntado en
  `diagnostico_pendiente_v1` para reintentarlo al volver a entrar.
- Informes lee además el espejo de progreso (`training_state`, claves
  `diagnostico_resultado_v1` y `diagnostico_estado_v1`): así aparecen los
  diagnósticos que quedaron solo ahí y se distingue "no lo ha empezado" de
  "lo dejó en la pregunta N".
- El plan vive en la tabla `training_plans` (Supabase, proyecto AjedrezIntegral).
  Su RLS es la que manda: el alumno solo ve el plan si `shared = true`, y solo su
  profesor o un administrador puede crearlo o editarlo.
- En Informes, profesores y administradores ven "🧭 Diagnósticos de nivel": el
  resumen del grupo con sus gráficos (nivel por alumno, promedio por área y el
  perfil de nueve áreas de cada uno). Las barras usan tres bandas —a trabajar,
  en camino, firme— y **el color nunca va solo**: verde y ámbar no se
  distinguen con daltonismo (ΔE 5.7 en deutan, comprobado con el validador de
  la skill dataviz), así que cada barra lleva su porcentaje y su etiqueta en
  texto, y hay leyenda.
- `diagnostico-de-nivel.pdf` (`material/diagnostico-de-nivel/`, con candado por compra) es el diagnóstico en papel, con sus
  diagramas y su hoja de corrección. **No se edita a mano**: lo genera
  `herramientas/diagnostico-pdf.js` desde el banco de ítems, así que al tocar
  ítems, áreas o niveles hay que volver a correrlo (`node
  herramientas/diagnostico-pdf.js`, con playwright instalado) o el papel deja de
  coincidir con la pantalla. El cuadernillo es **una** de las formas posibles
  de la prueba, sorteada con semilla fija: `SEMILLA=<número> node
  herramientas/diagnostico-pdf.js` saca otra versión, útil para aplicar dos
  formas distintas en el mismo grupo. **Trae las respuestas** y la hoja de
  corrección, así que lleva marca de agua ("Ajedrez Integral · uso docente",
  repetida en todas las páginas) y el enlace para descargarlo **solo aparece
  para quien administra**.

### Los tres PDF con las respuestas son SOLO de administración

`diagnostico-de-nivel.pdf`, `libro-de-diagnostico.pdf` y
`examen-de-arbitraje.pdf` traen las respuestas y la hoja de corrección. Antes se
le ofrecían a todo el equipo docente; ahora solo a `is_admin`. La razón es
simple: cuanta más gente los tenga bajados, más fácil es que terminen circulando
y que las dos pruebas dejen de medir nada. Quien dé clase y los necesite se los
pide a quien administra.

Están enlazados en **cuatro** lugares y los cuatro comprueban `is_admin`:

- `entreno/diagnostico.html` — `mostrarPdfSiEsAdmin()` destapa los dos y su nota;
- `arbitraje.html` — el bloque `#banco-pdf`, que arranca oculto;
- `informes.html` — dentro del texto de "todavía nadie ha hecho el diagnóstico",
  detrás de un `profile.is_admin ?`. **Este es el que se escapa**: no es un
  enlace escrito en el HTML, se arma con JavaScript dentro de un template, así
  que buscar `href="…pdf"` a mano no lo encuentra.

Como todo filtro del sitio, esto decide qué se **pinta**: los archivos siguen en
la raíz y quien conozca la dirección los baja igual — para eso llevan marca de
agua en todas las páginas y van sin permiso de copiar ni imprimir. Cerrar la
puerta del todo pediría servirlos desde Supabase Storage con RLS.

`verificar-admin.js` abre las páginas con las tres caras (alumna, profesora,
administración) y **mira si el enlace se ve**, y además barre el sitio entero
por si alguien vuelve a escribir uno suelto en otra página. Ese barrido fue el
que encontró el de `informes.html`.

### El libro del banco

`libro-de-diagnostico.pdf` es **otra cosa** que `diagnostico-de-nivel.pdf`, y
conviene no confundirlos: aquel es UNA forma de la prueba, sorteada, para que el
alumno la conteste en papel; este es el **banco entero** —todas las preguntas (696 desde la versión 6), área
por área y escalón por escalón, con la respuesta marcada, el porqué y cómo se
comprobó cada posición—, para estudiar y para corregir. Uno se reparte, el otro
no. Lo genera `herramientas/diagnostico-libro.js`.

Es el hermano de `examen-de-arbitraje.pdf` y comparte **todas** sus
características, a propósito: tapa a página completa impresa aparte y pegada con
`pypdf`, capítulo por área, índice, escala de niveles, hoja de respuestas al
final, opciones barajadas con semilla sacada del id, marca de agua estampada con
`pypdf` en todas las páginas del cuerpo (recomprimiendo y clonando después, o el
archivo se va a megabytes), firma en la tapa, en el pie, en los datos del archivo
y protección del PDF. `CLAVE_PROPIETARIO` es `diagnostico-ai-2026`.

- **Donde el de arbitraje pone la fuente del Handbook, este pone `prueba`**: qué
  se le comprobó a la posición con chess.js ("la jugada es legal y su bandera
  incluye la captura al paso"). Es el equivalente exacto — de dónde sale que la
  respuesta es esa, y no de la memoria de nadie.
- **El diagrama va al LADO de la respuesta, no encima.** Con el tablero arriba,
  cada pregunta con posición ocupaba media página y el libro se iba a 120.
- La hoja de respuestas lleva la letra de la opción **o la jugada**, según el
  tipo de ítem, y con "o" cuando hay más de una jugada válida (`alternas`): dar
  solo una dejaría a quien corrige marcando mal una respuesta correcta.

**Tiene su versión accesible**, `libro-de-diagnostico-accesible.html`, por la
misma razón que el material de estudio: un PDF con diagramas, marca de agua y
cifrado es lo peor que se le puede dar a un lector de pantalla. Cada posición va
contada pieza por pieza y con su FEN, y no hay ni una imagen. El describir lo
comparten los dos generadores desde `herramientas/lib/describir-fen.js` — estaba
dentro de `curso-material.js` y se sacó ahí, porque una segunda copia se iría
separando de la primera a la primera corrección.

Ese archivo **está exceptuado del barrido de `verificar-pwa.js`**, junto a
`inscripcion.html` y `formulario.html`: es un documento que se descarga y se abre
suelto —incluso por correo y sin red—, así que declarar un `manifest` que no va a
poder cargar sería peor que no declararlo.

**El libro descubrió un defecto que la tapa del de arbitraje ya tenía**, y se
arregló en los dos: `overflow: hidden` en el `body` **no recorta el body**, se
propaga al viewport. El tablero decorativo del fondo asoma 44 mm a la derecha, el
documento quedaba más ancho que A4 y Chromium **encogía la tapa entera al 79%** —
se veía como un lomo y un degradado que se cortan antes de llegar al borde de
abajo. Ahora los adornos viven dentro de un `.fondo` con su propio recorte. Los
dos PDF se volvieron a generar.

**Al tocar el banco de ítems o este generador, correr `python3
herramientas/verificar-libro-diagnostico.py`** (necesita `pypdf`). Lee el banco
con Node desde el mismo archivo que usa el sitio —comprobar el libro contra una
copia de la lista no comprobaría nada— y mira que el PDF esté cifrado y se abra
sin contraseña, que NO deje imprimir, copiar ni modificar pero SÍ extraer texto,
que lleve al autor, que tenga marca de agua en **todas** las páginas del cuerpo y
no en la tapa, que estén las 301 preguntas con su respuesta marcada, y que la
versión accesible no dependa de ninguna imagen, tenga los encabezados en orden y
cuente en palabras **cada una** de las posiciones que el PDF dibuja.


### Las 301 preguntas y los cinco niveles

El banco pasó de 118 ítems en 8 áreas a **301 en 9**: se sumaron 183 preguntas
del documento de Oscar («225 preguntas con sus opciones, la respuesta correcta y
la explicación») y con ellas la novena área, **Maestría** — lo que rodea al
tablero: reglamento de torneo, Elo y títulos, motores, partidas históricas.

**De las 225 del documento, 42 ya estaban** preguntadas de otra forma, muchas
veces al revés: «¿qué piezas dan el mate de Boden?» contra «¿cómo se llama el
mate de los dos alfiles cruzados?». Esas no se agregaron. Dos preguntas hermanas
en la misma prueba se regalan la respuesta entre ellas, y el comparador
automático no las distingue de las que solo comparten la plantilla de la frase
(«1.e4 e6 corresponde a la Defensa…» no es la Siciliana): la última pasada fue a
mano.

**Y no se reemplazó el banco viejo.** Los ids de los 118 ítems anteriores están
guardados dentro de los resultados ya rendidos (`detalle.items`), así que borrar
los que no aparecían en el documento habría roto la corrección de esos
diagnósticos.

#### El documento llegaba con la respuesta delatada

Medido antes de importar nada: **la correcta era la opción más larga en 193 de
las 225 (86 %)**, con 28 caracteres de ventaja de mediana —71 contra 34 de
promedio— y era la opción A en 208 de 225. Quien no supiera nada de ajedrez
aprobaba marcando siempre la más larga.

Lo de la posición se arregla solo, porque el sitio baraja las opciones en cada
intento. Lo del largo no: es **exactamente la falla que este banco ya había
tenido** (la correcta era la más larga en 91 de 96 ítems) y por la que
`verificar-diagnostico.js` falla si la correcta gana por más de 2 caracteres. La
causa era siempre la misma —la explicación venía metida dentro de la opción—, así
que se pasó a `explica`, que es donde vive, y las cuatro opciones quedaron
parejas. Son 183 ítems reescritos uno por uno; no hay forma de automatizarlo sin
estropear el contenido.

El documento **no traía los pesos**, aunque su introducción habla de 1 a 3. Están
puestos a mano, en la escala de 1 a 5 del resto del banco, según cuánto exige
cada pregunta. Maestría quedó con 5 en cada escalón, que es el reparto ideal.

Una de las 225 estaba **en el área equivocada** —«Un alfil se mueve siempre…»
figuraba en Cálculo— y se movió a Reglas: puntuada como cálculo, distorsionaba
esa área del informe.

#### Los niveles pasaron a cinco, con rangos de Elo

| Nivel | % global | Elo |
|---|---|---|
| Principiante | 0-29 % | hasta 1399 |
| Básico | 30-49 % | 1400 a 1599 |
| Intermedio | 50-69 % | 1600 a 1799 |
| Avanzado | 70-86 % | 1800 a 1999 |
| Muy avanzado | 87-100 % | 2000 o más |

- **La lista que llegó tenía un hueco**: Básico terminaba en 1599 e Intermedio
  arrancaba en 1601, así que el 1600 no caía en ningún nivel. Se cerró en
  Intermedio.
- **El último tramo queda abierto** hacia arriba aunque se muestre «2000 a
  2199»: si no, alguien de 2300 se quedaría sin nivel.
- **El Elo estimado se interpola DENTRO del tramo según el porcentaje**, no es
  el centro. Con un tramo tan ancho como Principiante (hasta 1399), el centro le
  pondría el mismo número a quien sacó 2 % y a quien sacó 28 %. El piso de ese
  tramo es 400 y no 0, porque cero no es una puntuación que exista.
- `nivelPorEscalones()` **tiene que recortar el índice**: `escalonAlcanzado()`
  devuelve de 0 a 5 y ahora los niveles son cinco, así que sin el tope quien
  supera el escalón 5 se quedaba con `NIVELES[5]`, que no existe. Los topes por
  área bajaron en consecuencia: un área por debajo del 30 % no pasa de
  Intermedio, y por debajo del 50 % no pasa de Avanzado.
- **`DiagnosticoPrueba.AREAS` ya no es una lista escrita a mano**: sale de
  `PlanEntrenamiento.AREAS`. Con la lista a mano, sumar la novena área habría
  dejado la prueba en ocho **sin que nada fallara** — simplemente no habría
  preguntado nada de Maestría y el informe la habría pintado en cero. Por eso
  los dos generadores de PDF cargan `plan-entrenamiento.js` ANTES que el banco.

#### Un diagnóstico nuevo ya no se compara con uno viejo

La prueba pasó de 56 ítems y 160 puntos a **63 y 180**, porque son nueve áreas
por siete ítems. Eso cambia la medición, así que `VERSION` subió a **4** y una
prueba empezada con la anterior se descarta con aviso. Los resultados ya
guardados se siguen leyendo y calificando con los umbrales de entonces, como los
de la versión 1: **no se vuelven a etiquetar**, porque se midieron con otra
prueba.

#### El diagnóstico es una puerta de entrada, así que se puede encontrar

`entreno/diagnostico.html` siempre se pudo hacer **sin cuenta** —quien no tiene
sesión deja nombre y correo y su resultado va a `diagnosticos_publicos`— pero
estaba escondido de dos maneras a la vez, y las dos había que quitarlas:

- la página llevaba `<meta name="robots" content="noindex">` y no tenía
  `canonical`, como todo lo que pide sesión;
- y **`robots.txt` tapa `/entreno/` entero**, que es lo que de verdad importa:
  con el `Disallow` puesto, quitarle el `noindex` no habría servido de nada,
  porque el buscador ni siquiera llega a leer la página. Por eso lleva
  `Allow: /entreno/diagnostico.html` **antes** del `Disallow`, que es como se
  desempata (gana la regla más específica).

Las dos mitades tienen que decir lo mismo, y separarlas no daría ningún error:
la página simplemente seguiría sin aparecer nunca. `verificar-metadatos.py`
comprueba ahora las cuatro cosas —el `Allow`, su orden, que no quede `noindex` y
que esté en el sitemap—, y el sitemap lo agrega solo (lo arma leyendo qué
páginas NO tienen `noindex`, así que solo hubo que volver a correrlo). Es la
**única** excepción de `/entreno/`; el resto del entrenamiento sigue tapado.

En la portada tiene su propia sección, hermana de la del examen de arbitraje y
justo antes: antes era una línea de letra chica debajo del hero. **Lo que NO se
enlaza ahí es `diagnostico-de-nivel.pdf`**: ese cuadernillo trae las respuestas
y la hoja de corrección, así que su enlace sigue apareciendo solo con perfil de
profesor o de administración.

#### Dónde vive en el panel de la Academia

En `clases.html` el diagnóstico tiene **tarjeta propia**, hoy en el grupo "Mide
tu nivel" y **solo para administración** (ver «El panel de la Academia»).
Estaba enterrado en Entrenamiento › Aprende › Asignaciones, que son tres clics
para lo primero que conviene hacer al entrar. El **examen de arbitraje** se mudó
de "Herramientas" a la par del diagnóstico: las dos son pruebas que ubican el
nivel de quien las hace, y en Herramientas quedaba entre el lector de planilla y
la caja de partidas. Se inserta buscando el diagnóstico **por su destino**
(`t.href`), no por su posición, para que reordenar el grupo no lo mande a otro
lado. De paso, la ficha de `tv.html` pasó a llamarse **"📺 TV en vivo"**: se
llamaba "Torneos" igual que la de `torneos.html`, así que el panel tenía dos
tarjetas con el mismo nombre y destinos distintos.

### Versión 5: 60 preguntas y la fuerza en puntos Elo

#### Lo que dijeron los diagnósticos rendidos

Antes de tocar nada se miraron los 80 diagnósticos guardados hasta el 25 de
septiembre de 2026 (`training_progress` y `diagnosticos_publicos`), 22 de ellos
con Elo declarado. La prueba de escalones **no distinguía a nadie por encima de
unos 1450**: un 1463 sacó 92 %, un 1527 93 %, un 1634 95 %, un 2033 93 % y un
2100 98 %; un 1200 en línea sacó 98 %. Pregunta por pregunta fue peor: **todos
los que pasaron del 80 % acertaron prácticamente todas las preguntas del
banco**, incluidas las de escalón 5. El techo de la prueba estaba en contenido
de club, y ninguna regla de escalones mide 1800 con preguntas que resuelve
cualquiera de 1450.

#### Qué cambió

- **Cada pregunta tiene su dificultad en puntos Elo** (`elo`): la fuerza con la
  que se acierta la mitad de las veces. La fuerza del alumno es la que mejor
  explica cuáles resolvió y cuáles no, con la curva del Elo
  (`PlanEntrenamiento.medir()`), y el nivel es el tramo de Elo de esa fuerza. El
  resultado trae su margen («≈1720 ± 110»). Acertar por azar está contemplado:
  0,2 en las de opción, 0 en las de mover. Lo guarda la página ya calculado en
  `detalle.medicion`, porque Informes no carga el banco; el Elo declarado se le
  suma después en `resumir()`, así que si el profesor corrige el Elo, el nivel
  se recalcula sin rehacer la prueba.
- **El Elo declarado se suma según lo preciso que es**: FIDE ± 100, nacional
  ± 150, en línea ± 250, estimado por el profesor ± 200 (`desvio` en
  `ELO_TIPOS`). Prueba y Elo pesan según sus márgenes.
- **271 preguntas nuevas de resolver en el diagrama**, de la base de Lichess
  (343 mil ejercicios, CC0, tabla «Ejercicios Lichess»): 191 de mover y 80 de
  opción. Su dificultad sale del rating del ejercicio (menos 400 las de mover,
  menos 550 las de opción). Las genera `herramientas/diagnostico-lichess.js`,
  que pasa cada una por **Stockfish** y solo deja las que tienen **una única
  jugada buena** (si gana, la segunda no gana; si salva, la segunda pierde).
  Van en el bloque `LICHESS-INICIO`/`LICHESS-FIN` del banco y **no se editan a
  mano**.
- **Las opciones incorrectas tientan y fallan por algo.** En las de opción de
  Lichess, las tres malas son las que un jugador de verdad consideraría
  —jaques, capturas, la misma pieza o la misma casilla que la solución, la
  segunda idea del motor— y cada una queda refutada por el motor; la
  explicación cuenta la refutación («Dxh7+? se contesta con …Rxh7 y la ventaja
  se esfuma»). En reglas se agregaron posiciones de «¿cuál es legal?» donde cada
  trampa falla por una regla concreta: el al paso que destapa al rey en la
  quinta fila, el enroque con la torre atacada (que SÍ vale), la pieza clavada
  que sí se mueve a lo largo de la clavada, el jaque doble. Llevan
  `legalidad: true` (o `ahogado: true` en «¿cuál NO ahoga?») y
  `verificar-diagnostico.js` comprueba con chess.js que la marcada es la única
  que cumple.
- **La dificultad de las 301 preguntas viejas se calibró con las respuestas
  reales** (`herramientas/diagnostico-calibrar.js`): las fuerzas de las
  personas y las dificultades de las preguntas se ajustan por turnos, con el
  Elo declarado como ancla de la escala. `eloBase` es el punto de partida y no
  se toca nunca (volver a calibrar con más datos parte siempre de ahí; si no,
  los mismos datos se contarían dos veces); `elo` y `peso` los reescribe el
  script. 216 preguntas cambiaron de escalón, casi todas hacia abajo: la
  mayoría de las «difíciles» resultaron de 1100 a 1400. Los datos de las
  personas se exportan fuera del repositorio y no se commitean.
- **La forma: 60 preguntas, la mitad de escalones 4 y 5.** Los escalones son
  tramos de dificultad (menos de 1100, 1100-1399, 1400-1699, 1700-1999, 2000 o
  más: `ESCALON_ELO`). Táctica, mates, finales y cálculo llevan más preguntas
  que reglas y maestría (ver `FORMA`): resolver una posición dice más de la
  fuerza que saber cómo se llama una defensa. Unas 40 de las 60 son de tablero.
- **Las áreas se juzgan contra lo esperable para su fuerza.** Con la mitad de
  la prueba difícil, un 1500 saca 30 % en casi todas las áreas sin tener ningún
  hueco. La banda de un área (a trabajar / en camino / firme) y el orden del plan
  salen de la **nota** (`notaDeArea`): 70 + (porcentaje − esperado). Sin esto,
  el plan habría mandado siempre a táctica y cálculo, que son las áreas con más
  preguntas duras, en vez de a lo flojo de cada alumno. En los resultados viejos
  la nota es el porcentaje, como siempre.
- **El tope por áreas ahora es relativo** (`topePorHuecos`): un área 45 puntos
  por debajo de lo esperable deja el nivel en Avanzado como mucho; 60, en
  Intermedio. El tope de antes (menos de 50 % → Avanzado) habría bajado a
  cualquier 2000 con un área difícil.
- **En Informes**, «Nivel por alumno» ordena y dibuja la fuerza estimada (los
  porcentajes de la prueba vieja y la nueva no se pueden comparar) y «Dónde se
  debe mejorar» promedia la nota de cada área.
- **En papel** no se puede hacer la cuenta de `medir()`, así que el
  cuadernillo trae una tabla de puntos logrados → fuerza estimada, calculada
  para ESA forma de la prueba con la curva esperada de puntos.

`VERSION` subió a 5: una prueba empezada con la 4 se descarta con aviso, y los
resultados viejos se siguen leyendo con su regla de entonces (escalones), sin
volver a etiquetarlos.

#### Qué tan bien mide (y lo que no se sabe todavía)

- **Simulación** con las dificultades calibradas: jugadores de fuerza conocida,
  pruebas sorteadas, respuestas según el modelo. En el centro de cada nivel, la
  prueba nueva acierta el nivel el 77-100 % de las veces (88 % en total), con un
  error típico de 60 a 90 puntos entre 1300 y 2200. La prueba vieja, con su
  regla de escalones y las mismas dificultades, acertaba el 22 %: mandaba a
  «Avanzado» o «Muy avanzado» a cualquiera de 1300 a 1900. Un 2100 con los
  finales de 1300 sale con el nivel topado el 84 % de las veces, y alguien sin
  huecos casi nunca (0-5 %).
- **Contra el Elo declarado**, con las preguntas viejas calibradas, la fuerza
  medida correlaciona 0,68 (el porcentaje, 0,70): con esas preguntas no se podía
  hacer mejor, y por encima de 1600 el margen se iba a ± 150-200 porque no había
  preguntas difíciles. Es una cota optimista (mismas personas con que se
  calibró).
- **Lo que falta saber**: el descuento de 400/550 del rating de Lichess es una
  suposición razonable (el rating de ejercicios de Lichess corre por encima del
  Elo FIDE, y aquí se pide solo la primera jugada y sin reloj), no una medida.
  En cuanto haya diagnósticos de la versión 5 con Elo declarado, hay que correr
  `diagnostico-calibrar.js`: ajusta esas dificultades igual que ajustó las de
  las viejas.

#### La primera calibración con la versión 5 (y la versión 6)

El 29 de septiembre de 2026 había 17 diagnósticos de la versión 5, 16 con Elo
declarado. **La prueba sobrestimaba a los jugadores de club en unos 350
puntos**: un 1400 nacional salía ≈1899, un 1495 FIDE ≈2096, un 1634 ≈2142. El
descuento que se le había puesto al rating de Lichess (−400 las de mover, −550
las de opción) se quedaba corto: el rating de ejercicios de Lichess está más
inflado respecto al Elo de lo que se supuso, y en el diagnóstico no hay reloj.

- **El calibrador estima ahora un corrimiento por tipo para todas las de
  Lichess juntas**, además del ajuste de cada pregunta. Cada pregunta de Lichess
  la había contestado una a tres personas, y calibrada sola casi no se habría
  movido; el corrimiento usa todas las respuestas a la vez. Salió **−380 las de
  mover y −160 las de opción** (o sea, rating − 780 y rating − 710). Con eso, el
  sesgo de la versión 5 contra el Elo declarado bajó de +349 a +59 puntos.
- **Al bajar, el escalón 5 quedó vacío.** Se agregaron ejercicios de Lichess
  de rating 2650 a 3060, tomados de mayor a menor rating y todos de mover
  (casillero 6 del generador). El banco pasó de 583 a 696 preguntas, sin perder
  ni cambiar ninguna de las publicadas.
- **Reglas dejó el escalón 5**: ninguna pregunta de reglas pasó de ~1920 con los
  datos (un jugador de 2000 conoce el reglamento), así que su casillero pasó a
  un segundo de escalón 4. Como cambió `FORMA`, `VERSION` subió a 6.
- **Los mates de escalón 5 son justos**: en toda la base hay solo 2 mates de
  2780 o más con las blancas en turno. Si hay que repetir la prueba, esas dos se
  repiten.
- Simulación con las dificultades nuevas: el nivel se acierta el 90 % de las
  veces en el centro de cada nivel, con un error típico de 70 a 90 puntos entre
  1300 y 2100.
- **Los 17 diagnósticos de la versión 5 ya rendidos se recalcularon** (16 de
  alumnos y 1 de visitante), a pedido del dueño del repo, porque se habían
  medido con las dificultades infladas: la mayoría bajó un nivel (un 1634 que
  había salido «Muy avanzado» quedó «Intermedio»). Se hizo en la base, en una
  sola transacción, en las tres copias: `training_progress`, el espejo de
  `training_state` (`diagnostico_resultado_v1`) y `diagnosticos_publicos`.
  Solo se tocaron `medicion`, `nivel` y `nivel_etiqueta`, y se agregó
  **`recalibrado`**: `{ fecha, motivo, medicion_anterior, nivel_anterior,
  nivel_etiqueta_anterior }`. Con eso el resultado, Informes y el PDF del
  visitante dicen «Resultado recalculado el …: por qué. Antes decía ≈X
  (nivel)» (`PlanEntrenamiento.notaRecalibrado`): quien vio «Avanzado» y ahora
  ve «Intermedio» tiene que saber por qué cambió.
  - **Primero se mergeó el código, después se tocó la base.** El espejo del
    aparato del alumno le ganaba al empate a la copia recalculada (misma
    `fecha`) y la volvía a subir; ahora la copia gana también por
    `actualizado` (js/progreso-usuario.js), y a la copia del espejo se le puso
    ese campo. **No se cambió `fecha`**: es la del diagnóstico, y
    progreso-usuario la usa para decidir si una prueba a medias ya terminó —
    moverla habría borrado la prueba a medias de quien estuviera haciendo una.
  - El script y los datos del recálculo no están en el repositorio: llevan las
    respuestas de personas. Si hay que repetirlo, se rehace con
    `PlanEntrenamiento.medir()` sobre `detalle.items` y `detalle.respuestas`, y
    cada `update` exige la fecha exacta del diagnóstico y que todavía no tenga
    `recalibrado` (así no se aplica dos veces).

#### Cómo se rehace

- Preguntas de Lichess: exportar candidatos (la consulta está en la cabecera
  del script) y `STOCKFISH=/usr/games/stockfish node
  herramientas/diagnostico-lichess.js candidatos.json`. **Después, siempre la
  calibración**: el generador escribe `elo = eloBase`, sin el corrimiento. El análisis del motor
  queda en `herramientas/.cache-lichess.json` (ignorado por git).
- Calibración: exportar las respuestas (consulta en la cabecera) FUERA del
  repositorio y `node herramientas/diagnostico-calibrar.js respuestas.json`.
  Imprime cuánto se movió cada pregunta y la correlación con el Elo declarado.
- Después de cualquiera de los dos: `node herramientas/verificar-diagnostico.js`
  y volver a generar `diagnostico-pdf.js` y `diagnostico-libro.js` (que
  necesitan pypdf; si el `cryptography` del sistema falla, en un entorno
  virtual).

## Examen de arbitraje (reglamento FIDE)

`arbitraje.html` es el examen de reglas para quien arbitra: 40 preguntas del
Handbook de la FIDE, 50 minutos y un nivel estimado de arbitraje. Es lo mismo
que el diagnóstico de jugadores en su forma —banco grande, sorteo, escalones de
dificultad— pero más formal: no hay tablero, cada respuesta cita su artículo y
no se puede "probar" una jugada.

- **Solo profesores y administración.** El enlace vive en la ficha
  "Herramientas" de `clases.html` (en el de quien administra, «Resultados de
  las pruebas»), y la página lo vuelve a
  comprobar (`perfil.role === 'profesor' || perfil.is_admin`): sin eso muestra
  el aviso de acceso denegado. Como todo en el sitio, el filtro es del
  navegador: `js/arbitraje-items.js` es un archivo estático con las respuestas
  adentro, así que quien conozca la dirección puede leerlo. Es un examen de
  formación entre docentes, no una certificación, y se asume así.
- **Ocho áreas** (`js/arbitraje-nivel.js` las describe con qué mide cada una y
  qué estudiar): `leyes` (art. 1-5), `reloj` (art. 6), `irregularidades`
  (art. 7), `tablas` (art. 8-9), `conducta` (art. 11-12), `ritmos` (apéndices
  A y B), `competicion` (C.04, C.07) y `titulos` (B.06).
- **El banco es mucho más grande que el examen**: 200 preguntas, 25 por área y
  5 en cada escalón de cada área. `ArbitrajePrueba.armar()` sortea 5 por área
  —una de cada escalón, 1 a 5— para un total de 40 preguntas y 120 puntos. La
  forma nunca cambia, así que dos exámenes de la misma persona se comparan
  aunque las preguntas hayan sido otras; con cinco candidatas por casilla, dos
  intentos seguidos casi no repiten preguntas.
- **El nivel sale de los escalones, no del porcentaje**, igual que en el
  diagnóstico: el nivel estimado es el escalón más alto superado (70% de
  aciertos ahí y los anteriores también), con tope por área — un área por
  debajo del 40% no pasa de Árbitro de club, por debajo del 60% no pasa de
  Nivel de Árbitro Nacional. Los seis niveles van de "En formación" a "Nivel de
  Árbitro Internacional" y **son una estimación de conocimiento del
  reglamento, no un título**: los títulos FIDE los da la FIDE, con normas y
  cursos (B.06).
- **Cada respuesta termina con su fuente exacta** en `fuente`, y la fuente exacta
  es el documento con su código del Handbook más el artículo:
  `Leyes del Ajedrez 2023 (Handbook E.I.01), art. 7.5.5`,
  `Reglamento de títulos de árbitro (Handbook B.06.1)`,
  `Reglas de desempate (Handbook C.07)`. Con el código se encuentra el capítulo
  en handbook.fide.com sin adivinar; no se ponen enlaces directos a cada
  capítulo porque la FIDE versiona esas direcciones con cada edición y quedarían
  muertas. Lo poco que de verdad no sale del Handbook lo dice con todas las
  letras (`Manual del árbitro (ARB)`, `Reglamento antitrampa de la FIDE (ACC)`,
  `Reglamento de cada torneo: no está en el Handbook`), en vez de inventar una
  cita precisa. Tanto la corrección en pantalla como el cuadernillo la imprimen
  al final de cada respuesta, con la etiqueta "Fuente:".
  Citar es parte de lo que enseña el examen —un árbitro no discute de memoria— y
  es lo que permite volver a contrastar el banco: el reglamento cambia (en 2023
  la sanción por jugada ilegal en rápidas bajó de dos minutos a uno), así que al
  tocar una pregunta hay que releer el artículo vigente.
- **Vocabulario latinoamericano, no peninsular.** El texto de la FIDE en
  español dice "reclamación"; en el banco se dice **reclamo**, que es lo que se
  usa acá. Los ids `tab_reclamacion_falsa` y `con_reclamacion_arbitro` conservan
  la palabra vieja a propósito: son identificadores y se guardan en
  `training_state` con cada examen rendido, así que cambiarlos rompería los
  resultados ya guardados.
- **Ninguna opción puede delatarse por el largo** (la misma regla que el
  diagnóstico) y hay **"Dejar en blanco"**, que vale cero como fallar pero se
  guarda aparte: un hueco que estudiar no es lo mismo que una regla aprendida
  al revés.
- `herramientas/verificar-arbitraje.js` comprueba todo esto de una corrida (ids
  repetidos, áreas y escalones válidos, cuatro opciones sin repetir, `fuente`
  presente **y con código de Handbook**, el largo de las opciones y que el banco
  alcance para la cuota). No
  necesita nada instalado: `node herramientas/verificar-arbitraje.js`. **Al
  tocar el banco, correrlo.**
- `examen-de-arbitraje.pdf` (`material/examen-de-arbitraje/`, con candado por compra) es el banco entero en papel, tipo libro:
  tapa diseñada, capítulo por área, dentro de cada uno las preguntas ordenadas
  por escalón, con
  la opción correcta marcada, el porqué y el artículo del Handbook, más el índice
  por área, la escala de niveles y la hoja de respuestas al final. **No se edita
  a mano**: lo genera `herramientas/arbitraje-pdf.js` desde el mismo banco, así
  que al tocar preguntas hay que volver a correrlo (`node
  herramientas/arbitraje-pdf.js`, con playwright instalado) o el papel deja de
  coincidir con la pantalla. **La tapa se imprime aparte** y se pega al cuerpo
  con `pypdf`: va a página completa, sin márgenes ni pie de página (por eso no
  lleva número y el cuerpo empieza en la página 1), con el fondo llegando al
  borde del papel. Ese fondo opaco es además lo que tapa la marca de agua en la
  tapa, que es `position: fixed` y si no se repetiría también ahí; el aviso de
  uso docente va en la tapa como sello propio. Las opciones se barajan con una semilla sacada del
  id de la pregunta: así la correcta no queda siempre primera y dos impresiones
  salen idénticas. **Trae las respuestas**, así que va marcado: el logo de Oscar
  Angulo Cubero (`img/logo-oscar-angulo-marca.png`) como marca de agua en las 61
  páginas del cuerpo, el mismo logo en grande en la tapa
  (`img/logo-oscar-angulo.png`), el sello "uso docente" en la tapa y en el pie
  de cada página, y la firma **IA Oscar Angulo Cubero** en la tapa, en el pie y
  en los datos del archivo. El enlace para descargarlo vive dentro de
  `arbitraje.html`, que ya es solo de profesores y administración.
- **La marca de agua se estampa con `pypdf`, no con CSS.** Se probó primero con
  `position: fixed` (que es como la lleva el cuadernillo del diagnóstico y
  Chromium sí la repite en todas las páginas) y se abandonó: al paginar no
  respeta el centrado y la marca terminaba corrida a la derecha y cortada por el
  borde. Ahora el generador imprime una hoja de sello del tamaño exacto de la
  página y la mezcla sobre cada página del cuerpo. **Después de estampar hay que
  recomprimir y clonar**: mezclar deja el contenido de cada página sin comprimir
  (unos 60 KB por hoja, 4,2 MB de archivo). El generador vuelve a comprimir cada
  flujo y después abre el resultado con `PdfWriter(clone_from=...)`, que es lo
  que de verdad tira los flujos viejos —quedan sueltos pero el escritor los
  sigue guardando, y clonar solo copia lo que cuelga del catálogo—. Así el
  cuadernillo pesa 1,3 MB en vez de 4,2 MB. La tapa no la lleva: ya tiene
  el logo en grande. Los dos PNG del logo salieron de recortar el logotipo
  original y pasarle el fondo a transparente; el de la marca es gris para que se
  vea sobre papel blanco.
- **El PDF sale protegido**: se abre sin contraseña, pero no se puede copiar el
  texto, ni editarlo, ni imprimirlo. Lo hace el propio generador, que después de
  Chromium vuelve a escribir el archivo con `pypdf` (`pip install pypdf`); la
  contraseña de propietario —la que levanta esas restricciones— es
  `arbitraje-ai-2026` y está en `CLAVE_PROPIETARIO`, dentro del generador. Queda
  habilitada a propósito la extracción de texto para lectores de pantalla:
  bloquearla dejaría el cuadernillo fuera del alcance de quien lo lee así, y no
  es lo que se quiere evitar. Si falta `pypdf`, el generador borra el archivo y
  falla en vez de dejar un PDF sin proteger. Con todo, es protección del formato
  PDF, no una caja fuerte: quien conozca la dirección lo baja igual y con una
  herramienta puede quitarle las restricciones. Evita la copia y la reimpresión
  de paso; para cerrar la puerta del todo habría que servirlo desde Supabase
  Storage con RLS.
- El resultado se guarda en `training_state` (claves `arbitraje_resultado_v1` y
  `arbitraje_historial_v1`), no en `training_progress`: no es actividad de
  alumno. Quien administra ve además, dentro de la misma página, el último
  resultado de cada profesor.

### El mismo examen, abierto al público

`nivel-de-arbitraje.html` es la versión pública: entra cualquiera, sin cuenta,
y está enlazada desde la portada del sitio. Usa **el mismo banco y el mismo
criterio** que la herramienta docente —40 preguntas, 50 minutos, los mismos
escalones—, así que un resultado de afuera se lee igual que uno de adentro.

- **Pide nombre y correo antes de empezar**, y lo dice para qué: para poder
  mandar la retroalimentación. No hay cuenta, ni contraseña, ni verificación
  del correo.
- **No muestra las respuestas correctas al terminar**, a diferencia de
  `arbitraje.html`. El banco se sortea y enseñarlas convertiría el examen en un
  juego de memoria; además las respuestas son el material docente. Van dentro de
  la retroalimentación que escribe el profesor. (El banco es un archivo estático
  y quien sepa mirar el código las ve igual: la página lo asume y por eso dice
  que es para ubicarse, no una certificación.)
- **Se guarda con `public.registrar_arbitraje_publico()`**, una función
  `SECURITY DEFINER` con permiso de ejecución para `anon`, no con un insert
  directo. Así quien no tiene sesión escribe su resultado sin necesitar ningún
  permiso de lectura sobre la tabla —y no lo tiene: la RLS de
  `arbitrajes_publicos` solo deja leer y actualizar a profesores y
  administración— y la validación de nombre, correo y tamaño queda en el
  servidor. Se probó primero con un insert directo y se descartó: un
  `INSERT ... RETURNING` exige política de `SELECT`, que acá no debe existir.
- **La revisión y la respuesta viven en `arbitraje.html`**, en el bloque
  "📥 Exámenes del público": la lista con el desglose por área, un botón que
  arma un borrador de retroalimentación (nota, nivel, áreas flojas y qué
  estudiar, sacado del propio resultado) y el guardado, que marca `revisado`,
  la fecha y quién respondió.
- **El seguimiento vive en `informes.html`**, en el bloque "⚖️ Exámenes de
  arbitraje": cuántos llegaron, cuántos faltan por responder, el promedio, y la
  tabla con nombre, correo, fecha, nivel, nota, las áreas flojas y el estado.
  Aparece en el resumen general y también solo, eligiendo "⚖️ Exámenes de
  arbitraje (público)" en el filtro de tema (`informes.html?tema=arbitraje`, que
  es lo que enlaza `admin.html`). Como no son alumnos sino visitantes, los
  filtros de alumno y de grupo no les aplican: llevan **su propio filtro de
  estado** (todos / sin responder / respondidos), que es la pregunta que se hace
  desde ahí. Informes solo muestra y cuenta; escribir la respuesta sigue siendo
  en `arbitraje.html`, que es donde está el detalle pregunta por pregunta.
- **El correo lo manda una persona, no un robot**: el botón abre el cliente de
  correo con el mensaje puesto (`mailto:`), para que salga de la dirección de
  quien responde. El sitio no tiene forma de enviar correo por su cuenta y no se
  le agregó una: haría falta una función con la clave de un proveedor guardada
  como secreto en Supabase.
- Las ilustraciones de la página son **SVG escritos a mano dentro del HTML**, no
  imágenes: no dependen de ningún archivo ni de ninguna licencia, y cada una
  lleva su `<title>` para quien use lector de pantalla.

## Confites del caballo

`confites.html` (ficha en Juegos) es el paseo del caballo contado como juego:
hay un confite en cada una de las 64 casillas y el caballo los recoge saltando,
pero **cada casilla pisada queda bloqueada**. La marca es cuántos juntó antes de
quedarse sin saltos; 64 es el recorrido completo.

- La **pista usa la regla de Warnsdorff** —ir a la casilla desde la que queden
  menos saltos— y lo explica, porque es la idea que de verdad resuelve el
  problema: las casillas con pocas salidas son las que se quedan aisladas si se
  dejan para el final. Con esa regla se completan las 64 (está comprobado en la
  prueba del navegador, jugando desde a1).
- **Dos marcas**, las dos declaradas en `CLAVES` de `js/progreso-usuario.js`:
  `confites_best` (la mejor, con ayuda o sin ella) y `confites_best_limpio` (la
  mejor sin pistas y sin deshacer). Deshacer cuenta como ayuda a propósito: sin
  eso se llega a 64 a fuerza de retroceder y la marca no diría nada.
- No escribe en `training_progress` —esa tabla tiene el CHECK de actividades y
  el juego no es una de ellas—; el tiempo sí se registra con
  `js/tiempo-plataforma.js data-activity="confites"`, que no tiene CHECK.

## El Sonar: un juego hecho para jugarse sin ver

`sonar.html` (tarjeta en Juegos y sección propia en `ciegos.html`) es el primer
juego del sitio que **no se adaptó para ciegos: se escribió así desde el
principio**. Hay un tesoro hundido en una casilla y **no lo ve nadie** —ni quien
usa lector de pantalla ni quien mira el monitor—. Tu pieza lo busca moviéndose
como en ajedrez, y después de cada jugada el sonar dice a cuántas jugadas DE ESA
PIEZA está. Como toda la información es un número y una casilla, se oye igual de
bien que se lee: con la pantalla o sin ella es el mismo juego, y un alumno ciego
y uno que ve compiten en igualdad. De paso enseña la geometría de la pieza (que a
un caballo la casilla de al lado le queda a tres saltos no se aprende leyéndolo).

Cuatro niveles: el rey (pasos), el caballo (saltos), dos tesoros (el sonar oye
el más cercano) y aguas turbias (solo dice «más cerca», «más lejos» o «igual»).

- **Las reglas viven en `js/sonar-motor.js`**, sin DOM, y las corre el
  verificador en Node: lo que se comprueba es la regla que juega el alumno, no
  una copia.
- **Se cuenta de cuatro formas que dicen lo mismo**: la región viva (`#aviso`,
  una sola, `role="status"` sin `aria-live` encima), tonos de Web Audio (tantos
  pitidos como jugadas faltan, más agudos cuanto más cerca; se apagan y la
  preferencia es del aparato), la voz del navegador si se pide
  (`BlindNotation.setupSpeechToggle`, con su aviso de «solo si no usas lector de
  pantalla») y el tablero pintado.
- **El recuadro de escribir va SIEMPRE a la vista**, no solo en Modo Adaptado:
  este juego se juega así y el tablero es la ayuda. Entiende «e4», «eva 4» y
  «eva cuatro» —escribir lo que uno acaba de oír tiene que funcionar— y ninguna
  letra suelta de la a a la h es un comando, porque son el principio de una
  casilla.
- **La memoria va escrita**: «historial» repasa cada lectura con su casilla, y
  cada casilla del tablero dice en su nombre accesible si ya estuviste y qué
  marcó el sonar. Quien ve tiene los números pintados delante; quien no, los
  necesita ahí.
- El tablero es `js/tablero-accesible.js` (una parada de tabulador, flechas,
  Intro mueve). Se le presenta una «partida» mínima —dónde está tu pieza y a
  dónde puede ir— para que «o», «z» y «m» contesten como en el resto del sitio.
  **El tesoro no está en esa partida**: no lo ve nadie.
- **La pista cuenta las casillas posibles** según lo que dijo el sonar
  (`candidatas()`), y quita la tercera estrella. Con dos tesoros la cuenta
  arranca en la lectura hecha AL RECOGER el primero, anotada en ese momento
  (`desdeLectura`). Buscarla por su casilla fue el error de la primera versión:
  volver a pisar esa casilla movía el corte y la pista olvidaba todo lo que el
  sonar había dicho entre medio, sin ningún error a la vista.
- **El tablero declara sus 8 filas iguales** (`grid-template-rows: repeat(8,
  minmax(0, 1fr))`) y la casilla lleva `min-height: 0`. `grid-cols-8` solo
  reparte las columnas: las filas quedaban en `auto` y cada una medía según lo
  que tuviera adentro, así que la fila del rey o de una lectura se estiraba y
  aplastaba a las demás. No daba ningún error; el tablero simplemente dejaba de
  ser un tablero. El verificador mide las 64 casillas antes y después de mover.
- **Exige sesión** (como Ilumina el tablero), así que está en `PAGINAS` de
  `academia-cabecera.py`. `?modo=ciego` enciende el Modo Adaptado con
  `AdaptiveMode.set()`.
- El progreso son `sonar_estrellas_v1` (nivel → estrellas, `maxPorClave`) y
  `sonar_mejor_v1` (nivel → menos jugadas). Esa segunda necesitó una fusión
  nueva, **`minPorClave`**, en `js/progreso-usuario.js`: fundirla con el máximo
  se quedaría con la PEOR marca de los dos aparatos. Cada partida terminada
  escribe una fila en `training_progress` (`'sonar'`, ver «Precisión, el Sonar
  y Batalla naval también cuentan»); el tiempo se registra con
  `js/tiempo-plataforma.js data-activity="sonar"`.

**Al tocar el motor o la página, correr `node herramientas/verificar-sonar.js`**
(con el sitio en localhost:8777 y playwright; `--sin-navegador` corre solo las
reglas). Comprueba las distancias contra hechos conocidos del caballo, que en 300
partidas por nivel **el tesoro nunca salga de las casillas posibles** —si
saliera, el sonar estaría mintiendo— y que un jugador que solo deduce (nunca
mira el tesoro) las termine todas y pueda sacar tres estrellas. En el navegador
juega una partida entera ESCRIBIENDO «eva 4», como la juega quien usa lector de
pantalla, y mira qué dice la región viva, qué recuerda cada casilla, que el
tablero sea una sola parada de tabulador y que se guarden las estrellas. Está
probado que falla de verdad: haciendo que el sonar sume uno, saltan cinco
comprobaciones.

## La Batalla naval de ajedrez

`batalla-naval.html` (tarjeta en Juegos y sección propia en `ciegos.html`) es la
batalla naval de siempre con piezas de ajedrez por barcos. La computadora
esconde su flota y se dispara a una casilla: si había una pieza se hunde y se
dice cuál era; si era agua, el disparo dice **cuántas piezas de la flota apuntan
a esa casilla**. Con eso se deduce dónde están, como en el buscaminas, y se
aprende la geometría de cada pieza. Es hermano de El Sonar y se hizo igual:
nadie ve lo escondido, así que se juega igual con la pantalla o sin ella.

Tres niveles de práctica con estrellas (torre, alfil y caballo; se suma la
dama; flota completa de siete) y un cuarto, **el duelo**, donde uno también
tiene flota y la computadora le dispara.

- **Cada pieza cuenta como si estuviera sola en el tablero**, y la cuenta es de
  la flota ENTERA, también de las hundidas. Se probó pensar en piezas que se
  tapan entre sí, como en una partida: la deducción se vuelve un rompecabezas de
  bloqueos que no enseña nada de la pieza, y contar solo las que siguen a flote
  hace que un número dicho antes cambie en silencio y el historial mienta. Así,
  un número no cambia nunca y se le restan las hundidas, que se ven.
- **Las reglas viven en `js/batalla-naval-motor.js`**, sin DOM. «Esta pieza
  apunta a esa casilla» se compara con chess.js en las 4032 parejas de casillas
  de cada pieza (rey negro en la casilla, ¿está en jaque?). Leer una casilla
  escrita («eva 4») es `SonarMotor.leerCasilla`: una sola copia.
- **`conocimiento()` es lo que se sabe desde afuera**, solo con los disparos:
  dos reglas seguras (a una casilla con agua que ya no le falta nadie no le
  apunta ninguna pieza a flote; si le faltan todas, todas le apuntan). Es la
  pista, es lo único que usa la computadora del duelo para dispararte —el
  verificador mueve tu flota escondida y comprueba que dispara igual— y es lo
  que usa el jugador que deduce del verificador.
- **Las estrellas salen de ese jugador**: en 300 partidas por nivel, la mediana
  queda por debajo de las tres estrellas (`estrellas3`). La computadora del
  duelo elige al azar entre las casillas casi tan buenas como la mejor
  (`HOLGURA_COMPU`): quien deduce bien le gana unas dos de cada tres veces.
- **Cada casilla escribe su propio nombre** (`data-etiqueta-propia`): el de
  `js/tablero-accesible.js` diría «vacía» en una casilla sin disparar, y eso
  sería mentira, porque puede esconder una pieza. El tablero de tu flota es
  solo un dibujo (`aria-hidden`); lo mismo va escrito debajo y «mi flota» lo
  dice entero.
- Los colores de agua, hundida y tu pieza se midieron contra su propio fondo
  (van en el `<style>` de la página) y nunca van solos: el número o la pieza
  van encima y en el nombre de la casilla. El agua segura de la pista es un aro
  de dos colores, para verse sobre la casilla clara y la oscura de cualquier
  tema.
- El progreso son `batalla_estrellas_v1` (`maxPorClave`), `batalla_mejor_v1`
  (`minPorClave`) y `batalla_victorias_v1` (`maxNumero`), en CLAVES de
  `js/progreso-usuario.js`. Cada partida terminada, también un duelo, escribe
  una fila en `training_progress` (`'batalla-naval'`, ver «Precisión, el Sonar
  y Batalla naval también cuentan»); el tiempo, con
  `data-activity="batalla-naval"`.

**Al tocar el motor o la página, correr `node herramientas/verificar-batalla-naval.js`**
(`--sin-navegador` corre solo las reglas). Está probado que falla de verdad:
haciendo que un disparo al agua sume uno, saltan nueve comprobaciones.

## Los Tipos de entrenamiento

> **En pantalla se llaman «Habilidades»** (pedido del dueño de la Academia): la
> página, las migas, el hub, el panel, Informes, Logros, Tareas, el plan del
> diagnóstico y la pestaña de la clase en vivo. Por dentro todo sigue igual:
> `entreno/tipos.html`, `js/tipos-*.js`, la actividad `tipos` y las claves de
> progreso (`tipos_estrellas_v1`, `tipos_20`…) no se renombran, porque son
> las que guardan el avance de cada alumno. Este título se queda porque el
> código lo cita.

`entreno/tipos.html` (grupo y tarjeta **"🧠 Tipos de entrenamiento"** del hub)
es una ficha con diecinueve entrenamientos que no son «encuentra la mejor jugada»,
cada uno con sus niveles: **El Detective** (¿qué jugada se acaba de hacer?,
análisis retrógrado), **¿Qué quiere el rival?** (profilaxis: hacer la jugada
que amenaza el rival), **Descarte** (tachar las candidatas que pierden),
**Siete diferencias** (qué detalle hace que el mismo golpe ya no funcione), **La
balanza** (poner la aguja de −5 a +5 contra el motor), **Fotografía** (memorizar
una posición y reconstruirla) y **Con lo justo** (dar mate con rey y una o dos
piezas contra el rey solo). Una sola página con tres vistas según el `#`:
`#` la ficha, `#detective` los niveles, `#detective/2` el juego (y
`#detective/2/<id>` un ejercicio concreto), así el «atrás» del navegador y un
enlace del profesor llevan a donde tienen que llevar.

- **Tres archivos, tres cosas.** `js/tipos-catalogo.js` dice qué es cada tipo y
  sus niveles (lo leen la ficha, la clase en vivo y el verificador);
  `js/tipos-reglas.js` son las reglas sin DOM (qué jugada anterior es posible,
  cómo se corrige cada uno, cómo se defiende el rey), que corren igual en el
  navegador y en Node; `js/entreno-tipos.js` solo pinta. Las posiciones están
  en `entreno/data/tipos.json`, que **no se edita a mano**: lo arma
  `herramientas/tipos-generar.js`.
- **Ninguna posición se inventa.** Las de los cinco primeros salen de partidas
  reales (el banco de Lichess de «Ejercicios por tema» y las líneas de
  `js/aperturas-lineas.js`); los finales de Con lo justo se sortean, pero su
  número se calcula exacto (abajo).
- **El Detective no promete una respuesta única «porque sí»**: `retro()` arma
  cada posición anterior posible —con o sin una pieza capturada en la casilla
  de llegada, con coronación, enroque o al paso— y pide que sea legal (el rey
  del que mueve ahora no podía estar en jaque cuando le tocaba al otro) y que la
  jugada lleve exactamente a lo que se ve. La buena tiene que ser posible y cada
  una de las otras imposible, con el motivo que dice su explicación. Por eso
  todas las posiciones tienen un rey en jaque: sin jaque casi cualquier jugada
  anterior es posible y la pregunta no tendría respuesta. Niveles: la pieza que
  da jaque se movió; dos opciones de la misma pieza (desde una ya daba jaque);
  a la descubierta; coronación, enroque, al paso y jaque doble.
- **¿Qué quiere el rival?** usa la posición del ejercicio con el turno
  cambiado (la «jugada nula»): el alumno ve su lado del tablero y mueve por el
  rival. Stockfish confirmó al generar que la amenaza es la mejor jugada del
  rival, que gana (mate o dos peones) y que la segunda no gana; el mate en 2
  además lo demuestra chess.js en el verificador. Solo cuenta la amenaza (o
  cualquier mate cuando se promete mate en 1).
- **Descarte** parte de la misma posición: ahora el alumno tiene que
  defenderse. Cada candidata se analizó sola, más hondo: «pierde» es 2,5 peones
  o más por debajo de la mejor que aguanta, «aguanta» es quedar a menos de 0,6,
  y no entra ninguna de la zona gris del medio, que no se podría corregir sin
  discutir. Entre las que pierden se prefieren capturas y jaques: son las que
  tientan.
- **Siete diferencias** son dos posiciones: A, la de un ejercicio real, donde
  el golpe gana, y B, la misma con UNA sola cosa cambiada (una pieza menos, un
  peón una casilla más allá o más acá, una pieza en la casilla de al lado), donde
  el mismo golpe ya no gana. Stockfish lo confirma en las dos: en A es la mejor
  jugada y gana (mate o 2 peones); en B, jugado igual, queda en +0,8 o menos. Los
  cambios se prueban cerca de la casilla del golpe, nunca sobre la pieza que lo
  da ni sobre un rey. El nivel 4 son líneas largas donde el rival contesta en B
  lo mismo que en A: la diferencia muerde más adelante. **A y B comparten todo
  menos el cambio**: turno, contadores y derechos de enroque (solo los que valen
  en las dos). La primera versión le dejaba a A sus enroques y a B ninguno, y
  eso era una segunda diferencia escondida que el alumno no podía ver en el
  tablero; el verificador exige ahora que el resto de la FEN sea idéntico. Se
  contesta tocando la casilla o escribiéndola, y si en B hay pocas defensas que
  refutan el golpe (tres o menos, analizadas en todas las respuestas), se pide
  además la refutación. En B el golpe se nombra sin «+» ni «#»: ahí ya no es
  ese mate.
- **La balanza** guarda la evaluación a profundidad 18 y solo si a
  profundidad 12 decía casi lo mismo. Los niveles salen de comparar esa
  evaluación con el material: el material decide; parejo o leve; material
  igual y un bando mucho mejor; y quien tiene más material no es quien está
  mejor. Del lado equivocado nunca hay estrellas, aunque la distancia sea
  corta.
- **Fotografía esconde de verdad**: al reconstruir, el tablero no tiene piezas
  y la lectura escrita del Modo Adaptado desaparece (sería soplar). Se
  reconstruye tocando casillas con una paleta o **escribiendo** «Rg1 Tf1 a2»
  por color, que es como la contesta quien no ve el tablero. Las marcas de la
  corrección llevan su signo escrito (✓ − ✗ +), el color no va solo.
- **Con lo justo tiene 69 finales, no 30.** Eran 6 por nivel y se acababan en
  minutos. `node herramientas/tipos-generar.js --solo con-lo-justo` rehace
  solo ese banco (no usa Stockfish: sale de las tablas) y deja el resto de
  `tipos.json` igual; pide 15 por nivel con hasta 3 por cada distancia al mate
  (dos torres y dama no dan para más: 12), y no repite una posición que el
  sorteo saque dos veces (pasó: dos iguales daban un id repetido). Las 30 de
  antes siguen, con el mismo id, así que nadie pierde sus estrellas.
- **Con lo justo: el mínimo es exacto, no «lo que dijo el motor».**
  Stockfish no sirve para contar jugadas hasta el mate: a una posición de rey y
  torre le dio «mate en 20», y el máximo teórico de ese final es 16. Así que
  `herramientas/lib/finales-dtm.js` resuelve la tabla ENTERA hacia atrás
  (análisis retrógrado, como las tablas de finales), capturas del rey negro
  incluidas (si se come una de las dos torres, sigue la tabla de rey y torre;
  si queda una pieza menor sola, tablas). Da los máximos conocidos de cada final
  (dama 10, torre 16, dos torres 7, dos alfiles 19, alfil y caballo 33), y eso
  lo comprueba el verificador cada vez. La primera versión daba 34 en alfil y
  caballo: el rey negro «tapaba» la línea del alfil hacia la casilla a la que
  se estaba moviendo, así que se comía piezas defendidas. Las tablas de cuatro
  piezas tardan unos 25 s cada una: no caben en el navegador, así que ahí el
  rey se defiende con una heurística (`defensaRey()`: se come lo que esté
  suelto, mira su jugada y la respuesta blanca, y huye del
  borde y de las esquinas del color del alfil). Por eso la página dice «contra
  la mejor defensa: mate en N» y se puede dar antes.
- **Lo escrito va en castellano primero.** `ChessMoveParser` prueba antes el
  texto tal cual, en inglés, y «Rc3» en inglés es la TORRE: con rey y torre,
  quien escribía «Rc3» queriendo mover el rey movía la torre (lo descubrió el
  verificador, que juega el final escribiendo). `jugadaEscrita()` traduce
  primero R D T A C al inglés y, si así no es legal, prueba lo demás.
- **El avance vive en la cuenta**: `tipos_estrellas_v1` («tipo:id» → mejores
  estrellas, `maxPorClave`) y `tipos_mejor_v1` (final → menos jugadas,
  `minPorClave`). Un ejercicio cuenta como resuelto con una estrella. **Y
  cada ejercicio resuelto va UNA vez a `training_progress`** como
  `activity = 'tipos'` (ver «Tipos cuenta: racha, logros, Cómo viene y
  tareas»); el tiempo, con `data-activity="tipos"`. Esa sección está en las
  dos tablas de nombres (`js/tiempo-secciones.js` y la de
  `informes-encargados`); la función del correo tiene que volver a
  desplegarse para que el correo a la casa la nombre.

### Los tipos 8 a 14

El Barrido, Intercambios, Constrúyela tú, Rey y peón, Adivina la jugada del
maestro, ¿Qué apertura es? y la Ruta segura. Sus reglas viven en
`js/tipos-reglas-mas.js` y **son la definición del ejercicio**: el generador
arma el banco con ellas, la página corrige con ellas y el verificador las
vuelve a correr sobre cada ejercicio. La página los juega en
`js/entreno-tipos-mas.js`, con las piezas comunes que expone
`js/entreno-tipos.js` (`window.TiposUI`); los que necesitan cargar algo antes
de jugar lo hacen en `PREPARAR[tipo]`.

- **El Barrido** pide la lista COMPLETA, no la mejor jugada. Las clases no se
  pisan: un jaque que captura es jaque; una captura sin jaque, captura; y una
  amenaza es una jugada tranquila tras la cual el bando que movió ataca una
  pieza rival (no el rey) que antes no atacaba así: sin defensa, o de más valor
  que su atacante más barato. Descubiertas incluidas. Anotar no mueve nada: el
  tablero sirve para tocar la jugada, y el verificador comprueba que ninguna
  pieza se movió.
- **Intercambios** es la cadena de capturas en UNA casilla, con la regla de
  siempre: cada bando captura con su pieza más barata que pueda capturar
  LEGALMENTE (una clavada no puede) y sigue solo mientras le conviene. Los
  niveles salen de la cadena misma: corta, larga, con una pieza que entra
  desde atrás (rayos X) o con una que ataca y no puede capturar (clavada). Sin
  coronaciones ni capturas al paso, que cambiarían el valor en medio.
- **Constrúyela tú** acepta cualquier casilla que cumpla: se comprueba jugando,
  no contra una lista. La lista (`soluciones`) está para el profesor y el
  verificador, que la recalcula casilla por casilla. La posición que queda
  tiene que poder existir: el bando que no mueve no puede estar en jaque, ni un
  bando tener más material del posible. En «Quita el mate» tampoco vale dar
  jaque, que taparía el mate por la vía fácil.
- **Rey y peón** se corrige contra la tabla ENTERA del final, resuelta en
  `herramientas/lib/kpk.js` (coronar con dama o con torre, lo que sirva; tablas
  si el rey negro se come la pieza nueva o queda ahogado). Da los números
  conocidos de este final —124.960 posiciones ganadas de 163.328 con blancas
  al mover, 97.604 de 168.024 con negras— y el verificador los exige. La tabla
  viaja a la página como un bit por posición (`entreno/data/kpk.json`, 64 KB) y
  se carga solo al entrar a este tipo. La «única jugada» es única de verdad:
  el verificador cuenta las que ganan.
- **Adivina la jugada del maestro** usa las partidas del curso «Partidas
  modelo», que están **detrás del candado de los cursos**. Por eso su banco se
  escribe en `cursos/protegido/data/tipos-maestro.json` (lo sirve el worker
  solo con el acceso vigente) y al banco público va únicamente el índice (id y
  nivel, para contar el avance). Quien no tiene el acceso vigente recibe un
  «no» del servidor y la página lo dice; el verificador comprueba que el
  índice público no traiga ni una posición. Cada jugada se compara contra la
  partida del curso, y «buena» es la que el motor da a menos de 0,3 de la
  mejor.
- **¿Qué apertura es?** sale de `js/aperturas-lineas.js`. En el nivel 1 solo
  entran posiciones que pertenecen a UNA apertura; en el 3 las jugadas vienen
  con dos del mismo bando cambiadas de lugar, y el verificador exige que
  lleguen a la misma posición y que el orden sea de verdad otro. En ese nivel
  el tablero no se muestra hasta contestar.
- **La ruta segura** mueve UNA pieza sin capturar y sin pisar nunca una
  casilla atacada por el rival (tampoco la de llegada; pasar por encima de una
  casilla atacada, en una jugada larga, sí se puede). Lo atacado se cuenta sin
  la pieza que viaja, porque ella no tapa nada. El mínimo es el camino más
  corto exacto.

### El tipo 15: Aguanta

Todo lo demás de Entrenamiento enseña a atacar; **Aguanta** enseña a
defenderse: al que mueve le amenazan algo serio y **solo UNA jugada lo para**.
La regla vive en `js/tipos-reglas-mas.js` (`aguantaAcertada`, `textoRefuta`) y
el juego en `js/entreno-tipos-mas.js`, como los tipos 8 a 14.

- **La primera idea no sirvió: girar el turno.** Se probó con la misma
  posición de ¿Qué quiere el rival? (la del ejercicio con el turno del que se
  defiende): de unas 1800 posiciones salieron 17. En casi todas, el que se
  defiende tenía algo MEJOR que defenderse (quedaba +2,5 o más, o hasta con
  mate): en un ejercicio de Lichess el rival suele acabar de comerse algo, y
  con una jugada de regalo le toca a uno cobrarse. Así que la fuente principal
  son los ejercicios que Lichess marca como defensa (`defensiveMove`,
  `equality`): ahí la jugada del alumno ES la defensa, tal como se jugó. Los
  giros de turno que sí cumplen también entran.
- **«Una sola» lo dice el motor, con dos búsquedas.** Todas las jugadas a
  profundidad 12 (de ahí sale, para cada error, la respuesta del rival que lo
  castiga) y las dos mejores a profundidad 18: esa búsqueda mira todas las
  jugadas, así que si otra aguantara saldría segunda. Entra solo si las dos
  coinciden en la mejor, la mejor queda entre −1,5 y +2,5 (se defiende; no
  hay un golpe propio) y la segunda pierde (recibe mate, o queda 2,5 peones
  abajo y en −2 o peor). Los mismos cortes que «pierde» y «aguanta» en
  Descarte.
- **La amenaza tiene que ser de verdad**: si le tocara al rival, su mejor
  jugada gana (mate o 2 peones). Por eso no entra ninguna con el rey en
  jaque: ahí la amenaza ya está hecha, y el «¿Qué quiere el rival?» de la
  pista no tendría qué mostrar. Tampoco entran posiciones con menos de 6
  jugadas (se adivina).
- **El nivel lo pone la amenaza, no el tema de Lichess**: comerse algo (1),
  mate en 1 (2), un golpe sin captura (3), mate en 2 o más (4). El tema de un
  ejercicio de defensa habla de la defensa, no de lo que amenazaba el rival;
  la amenaza la ve el motor. El verificador vuelve a calcular el nivel con la
  jugada guardada. Dentro de cada nivel van de menor a mayor rating. Hoy son
  113 (40, 18, 40 y 15): los de mate escasean porque casi ningún ejercicio de
  defensa de Lichess es contra un mate.
- **Una «amenaza» que es solo acercar el rey no entra.** El motor la da por
  buena (en un final, Rh4 gana el alfil que quedó encerrado), pero la pista
  «¿Qué quiere el rival?» mostraría un paso del rey y el alumno no aprendería
  nada. Eran 9 del nivel 3; el verificador exige que no vuelvan.
- **Fallar enseña**: la jugada se deshace y se dice cómo la castiga el rival
  («El rival contesta Cxe5 y el motor te da −3,4»), que es justo lo que no se
  ve cuando uno no se defiende. «👀 ¿Qué quiere el rival?» marca la amenaza en
  el tablero (con su signo escrito, «!» y «✕», no solo el color) y «💡 Pista»
  la pieza de la defensa; cada ayuda y cada error quitan una estrella, y al
  tercer error se muestra la respuesta (cuenta como fallado para el repaso).
- **Las marcas del tablero se dicen.** `js/tablero-accesible.js` vuelve a
  escribir el nombre de cada casilla y solo agrega lo que viene en
  `data-estado`; la página ponía la marca en el `aria-label` y se perdía. Se
  vio al verificar Aguanta, pero pasaba en todos los Tipos (la pista de ¿Qué
  quiere el rival?, las casillas de Siete diferencias): ahora la marca va
  también en `data-estado`.
- **Se genera aparte**: `node herramientas/tipos-generar.js --solo aguanta`
  rehace solo este banco con el motor y deja los otros catorce como están.
  Volver a correr todo con otra versión de Stockfish podría cambiar ids de
  los demás, y con ellos las estrellas guardadas de los alumnos.
- En la clase en vivo trae «❓ Preguntar» (cada alumno busca la defensa en su
  tablero) y la respuesta para el profesor: la defensa, la amenaza, la línea y
  por qué la segunda mejor ya pierde.

### El tipo 16: Remata la ventaja

La otra mitad de lo que no se entrenaba: **convertir**. Muchas partidas
ganadas se escapan después del golpe, cuando ya no hay nada que calcular y hay
que simplificar, cambiar piezas y no dejarle contrajuego al rival. El alumno
empieza con +4 o más en una posición de partida real y juega contra Stockfish
a toda su fuerza (`PracticeEngine`, el mismo Worker de Finales contra la
máquina y de la práctica en la clase). La regla vive en
`js/tipos-reglas-mas.js` (`cpDelAlumno`, `juicioRemata`, `estrellasRemata`) y
el juego en `js/entreno-tipos-mas.js`.

- **No hay «la jugada buena»: decide el motor.** Después de cada jugada del
  alumno, el motor mira la posición. Si baja de +1,5, **se escapó** y termina
  ahí, diciendo con qué jugada y cuánto quedó. Al cumplir las jugadas del
  nivel (8, 10 o 12, en el catálogo) tiene que seguir en **+3 o más**; el mate
  lo gana antes. Tablas por reglamento (ahogado, repetición, 50 jugadas,
  material insuficiente), las decide chess.js, son escaparse.
- **Estrellas**: tres si nunca bajó de +3, dos si bajó y lo recuperó, una con
  pista («💡 Pista»: la máquina marca la pieza con que jugaría).
- **Si el motor no contesta, no cuenta** (como en Finales): sin evaluación no
  se puede saber si se escapó, y regalarlo mentiría en Informes. Tampoco
  cuenta si la máquina no pudo jugar.
- **De dónde salen**: de los ejercicios de «Ejercicios por tema» que ganan
  material o posición (`crushing`, `advantage`; no los de mate). Se juega la
  solución, el rival contesta con la mejor del motor (profundidad 16) y le toca
  al alumno. Entra si quedan 14 piezas o más (medio juego: los finales de libro
  ya están en Finales contra la máquina), nadie está en jaque, y el motor da
  entre +4 y +8 sin mate a profundidad 18, habiendo dicho casi lo mismo a
  profundidad 12 (a menos de 1): con +9 ya no hay nada que rematar, y una
  posición donde el motor duda no sirve para medir si se escapó.
- **El nivel lo pone el material**: una torre o más (1), una pieza (2), casi
  igual (3): esa es la más difícil, porque la ventaja es de posición y se
  enfría si no se juega rápido.
- **La evaluación del navegador es más corta** (medio segundo) que la del
  banco (profundidad 18), y se mueve: probándolo con el Stockfish de verdad,
  jugar la mejor jugada del motor en un +3,3 del banco se leyó +2,1. Con el
  banco empezando en +3, alguien que juega perfecto podía «no lograrlo». Por
  eso **el banco arranca en +4 y la meta es +3** (un peón de margen para ese
  ruido), y el corte de «se escapó» está en +1,5: lo que se mide es que la
  ventaja no se derrumbe, no décimas.
- `node herramientas/tipos-generar.js --solo remata` rehace solo este banco.
  En la clase en vivo trae «🎯 Practicar»: cada alumno la juega contra el
  motor en su tablero.

### El tipo 17: Elige a tiempo

Lo que la Racha táctica no toca: **decidir con el reloj en contra cuando no
hay táctica**. Una posición tranquila, dos a cuatro candidatas razonables y un
reloj (30, 15 u 8 segundos). La regla vive en `js/tipos-reglas-mas.js`
(`estrellasTiempo`, `segundosTiempo`) y el juego en `js/entreno-tipos-mas.js`.

- **No hay «la única buena».** Cuenta cuánto pierde la elegida contra la mejor:
  la mejor (o a menos de 0,3), tres estrellas; hasta 1,1, dos (se resuelve);
  más, ninguna. **Si se acaba el tiempo, cero**: en una partida se pierde por
  tiempo, y es justo lo que se entrena.
- **Las candidatas se analizan cada una SOLA** (`searchmoves`) a profundidad
  18, y la pérdida es contra la mejor analizada igual; así la comparación no
  depende de cuántas líneas miró el motor. Hay una mejor, una razonable
  (pierde más de 0,3 y hasta 1,1: los cortes son los mismos de la regla de la
  página, `M.TIEMPO`, para que ninguna razonable dé tres estrellas) y uno o dos errores (entre 1,3 y 4), eligiendo
  capturas y jaques porque son los que tientan con prisa. **Nada que pierda más
  de 4**: se descarta sin pensar y no enseña nada.
- **Tranquila de verdad**: la segunda mejor está a menos de 0,6 de la mejor
  (profundidad 12), nadie en jaque y la mejor entre −1,5 y +3 (medido con la
  evaluación que se guarda, la de profundidad 18: la primera versión lo medía
  a 12 y 20 se salían del rango; lo encontró el verificador). Si hubiera un
  golpe, sería otro ejercicio. Salen del final de los ejercicios de «Ejercicios
  por tema» (el golpe ya pasó), con la mejor respuesta del rival.
- **Modo Adaptado: el triple de tiempo.** Leer la posición con lector de
  pantalla toma mucho más que mirarla; el reloj entrena decidir, no leer
  rápido. La página lo dice al empezar. El número del reloj es
  `aria-hidden` (cambia cada segundo); lo que se anuncia es el inicio, la
  mitad (si es de 10 segundos o más) y los últimos 5.
- Se elige con los botones, tocando la jugada en el tablero o escribiéndola;
  una jugada que no es candidata no cuenta. Al terminar, cada candidata dice
  cuánto pierde con su signo escrito (✓ ≈ ✗), no solo con color.
- El verificador de la página no espera el reloj: lo adelanta
  (`clock.fastForward` de Playwright).
- `node herramientas/tipos-generar.js --solo tiempo` rehace solo este banco.

### El tipo 18: Tus propios errores

El único tipo **sin banco**: los ejercicios salen de las partidas de cada
alumno. En la ficha del tipo, «🔎 Buscar errores en mis partidas» revisa hasta
10 partidas nuevas con Stockfish en el navegador del alumno, y cada jugada
donde se cayó la evaluación se vuelve un ejercicio: encontrar una jugada buena
en esa posición. Todo vive en `js/errores-propios.js`; el juego y el botón, en
`js/entreno-tipos-mas.js`. El catálogo lo marca `propio: true`, y así lo tratan
la página (lo carga de la cuenta y no de `tipos.json`), la clase en vivo (no
hay lista: cada alumno tiene los suyos) y los verificadores.

- **De dónde salen las partidas**, las dos con la RLS de siempre (el alumno
  lee las suyas; ninguna migración nueva):
  - `game_rooms`: Juegos, retos, parejas de la clase y torneos. Solo
    `variant = 'estandar'` y `status = 'finished'`. **No guarda la posición de
    inicio**: se reproduce desde la inicial y, si una jugada no es legal (la
    partida empezó «desde el tablero» en la clase), se deja fuera y se marca
    como revisada para no volver a intentarlo.
  - `practice_games`: la práctica contra el motor en la clase, con la posición
    de `practice_sessions` (la leen los alumnos de quien la creó). Solo guarda
    el último intento de cada práctica: los anteriores ya no existen.
  - El Bot de Oscar y los ejercicios de Entrenamiento no guardan las jugadas
    (a propósito): no entran.
- **Cómo se decide que fue un error**, en centipeones desde el lado del alumno
  (un mate cuenta ±10): una pasada a profundidad 10 por todas las posiciones;
  una jugada del alumno es error si la evaluación cae **2 peones o más**, y es
  «Lo que regalaste» (nivel 1) si estaba en −1,5 o mejor y quedó en −1 o peor,
  o «Lo que se te escapó» (nivel 2) si estaba en +2 o más y quedó por debajo
  de +1,5. Lo que ya estaba perdido no cuenta. De cada partida, los tres más
  grandes.
- **La mirada honda confirma**: en cada error, cuatro líneas a profundidad 14.
  Las **buenas** son las que quedan a menos de 0,5 de la mejor, y vale
  cualquiera. Si la honda pone la jugada de la partida entre las buenas, o si
  la mejor no deja 2 peones por encima de lo que se jugó, **no hay ejercicio**:
  la pasada corta se equivocó. Probado con la trampa Blackburne Shilling: no
  marca Cxe5 (todavía se salva con Axf7+), sí Cxf7, de +0,1 a −4,6.
- **Lo que se guarda**: dos claves que viajan con la cuenta
  (`errores_propios_v1`, los ejercicios; `errores_analizadas_v1`, qué partidas
  ya se miraron), fundidas por unión. Así el alumno los ve en cualquier aparato,
  no se revisa dos veces la misma partida y el profesor las puede leer
  (`training_state`). **No se guarda el nombre del rival**: solo la posición,
  la jugada que se hizo y las buenas. Como mucho 60 ejercicios, los más
  recientes.
- **El juego** es como Aguanta: cualquier jugada buena gana; la de la partida
  se reconoce («esa es la que jugaste: fue el error»); cada error y la pista
  quitan una estrella; al tercero, la respuesta. Al final dice qué pasó en la
  partida («jugaste Cxf7 y la evaluación pasó de +0,1 a −4,6»). Resolver uno
  cuenta como cualquier Tipo (`activity = 'tipos'`, `category = 'errores'`).
- **Cada error lleva su tema** («Lo que no viste: Horquilla», «Lo que te
  hicieron: Clavada»), con el mismo reconocedor de patrones de la preparación
  de rivales (`PreparacionTactica.temaDeJugada`, sin motor, con
  `preparacion-posiciones.js`): si se le escapó la ventaja, el de la mejor
  jugada que no vio; si regaló, el de la respuesta con que lo castiga el rival
  (una evaluación más, la de la posición después de su jugada). «Otra» no se
  guarda: no dice nada. El motor manda las jugadas sin «+» ni «#»; se
  completan con chess.js antes de reconocerlas, porque el mate se reconoce por
  el «#». `temasDe()` cuenta cuál se repite: la ficha del tipo dice «Lo que más
  se repite en tus errores: clavadas (3 de 5)» con el enlace a practicarlas en
  «Ejercicios por tema» (`temas.html?tema=pin`), cada ejercicio trae el suyo al
  terminar, e Informes lo muestra al profesor. Los ejercicios de antes de esto
  no tienen tema y se ven igual, sin él.
- **Se puede pedir en Tareas**: «resuelve 5 de tus errores». `tareas_con_avance()`
  ya contaba ejercicios distintos por `category` (`errores`) y nunca usó el
  total, así que no hizo falta nada en la base: solo ofrecer el recorte.
  `metas-indice.py` lo pone en `metas.json` con `total: null` (no hay un banco
  que dé un tope; queda el de siempre, 1000, y el nombre va sin «(N)»), y
  `verificar-tareas.js` acepta los tipos `propio` sin total y prueba que el
  formulario lo ofrezca así.
- **El profesor los ve en Informes**, en el informe de cada alumno (ver «Los
  errores de sus partidas» en informes.md): los lee de `training_state` con
  `ErroresPropios.deFilas()`, que no le cree nada a lo que guardó el navegador. Desde
  ahí los lleva a un plan de clase, y la vista de grupo suma los temas de
  todos (ver «Llevar sus errores a un plan de clase» y «Los temas de los
  errores de todo el grupo» en informes.md).
- `herramientas/verificar-errores-propios.js` prueba la detección, el armado y
  la regla sin motor; `verificar-tipos-pagina.js` busca errores en partidas de
  mentira con un motor de mentira (el doble de Supabase filtra de verdad: la
  partida de otra variante, la ajena y la que sigue en curso ni llegan) y
  juega el ejercicio.
- **«Revisa esta partida» al terminar una partida en Juegos**: `estandar.html`
  muestra, a quien jugó (no a quien mira) una partida terminada de 10 jugadas o
  más, el enlace «🪞 Revisa tus errores en esta partida» a
  `entreno/tipos.html?revisar=juego:<id>#errores`. La ficha lo lee, lo borra de
  la dirección (recargar no vuelve a revisar) y revisa **solo esa partida**:
  `traerPartidas()` la pide por su id (validado) entre las del propio alumno, y
  `analizar()` filtra otra vez las pendientes por esa clave. Las dos defensas
  son a propósito: el verificador rompe las dos y salta; una sola no alcanza
  para romperlo. Dice si no la encontró (la de otra persona, u otra variante),
  si es muy corta, si ya estaba revisada, o cuántos errores salieron, con «Ir
  al primero →». `verificar-juegos-accesible.js` prueba cuándo sale el enlace;
  `verificar-tipos-pagina.js`, que se revise solo esa.
- **Un error de partida vuelve al repaso aunque salga limpio.** En los demás
  tipos, lo que sale con tres estrellas a la primera no entra a «Repasar
  fallados»; un error de partida ya se falló una vez, jugando, y resolverlo
  bien una vez no es saberlo. `RepasoFallados.anotar()` tiene la opción
  `entraLimpio` (solo la primera vez que se ve: uno que ya salió de la cola con
  su racha no vuelve a entrar por salir limpio), y `entreno-tipos.js` la usa
  para los tipos `propio`. Vuelve al día siguiente y a los tres días, y sale
  con los tres limpios seguidos de siempre. Al cerrar el ejercicio se le dice
  cuándo vuelve («mañana», «el 3 de octubre»): si no, parecería que
  desapareció. `verificar-entreno-repaso.js` prueba la opción (rota a
  propósito la guarda de «solo la primera vez», salta: por eso compara la
  ficha antes y después, porque con la racha de siempre el resultado era el
  mismo), y `verificar-tipos-pagina.js` que un error resuelto limpio quede con
  su ficha para mañana.
- **Sus partidas de Lichess o Chess.com.** La mayoría de los alumnos juega
  mucho más afuera que en Juegos. Debajo del botón de buscar, plegado,
  «¿Juegas en Lichess o Chess.com?»: el sitio, el usuario y «Traer y revisar»
  bajan sus últimas 30 partidas públicas y revisan hasta 10 nuevas, igual que
  las de la Academia.
  - **Nada nuevo para bajar ni para leer**: el descargador
    (`PreparacionDescarga`) y el lector de PGN (`PreparacionAnalisis.leerPgn`)
    son los de la preparación de rivales (ver «Bajar las partidas de Lichess o
    Chess.com» en paneles.md). Pesan unos 100 KB, así que se cargan recién al
    pedirlo, desde la misma carpeta que `entreno-tipos-mas.js`; el verificador
    comprueba que antes no estén.
  - `ErroresPropios.deLaWeb()` (pura) se queda con las de ajedrez normal desde
    la inicial (ni Chess960 ni «From Position») en que jugó ese usuario, sin
    distinguir mayúsculas, sin repetir y la más nueva primero. La clave es el
    id del sitio (`lichess:AbCd1234`, `chesscom:123456`, del `Site` o el
    `Link`): es lo que la marca como revisada, así que no choca con las de
    Juegos. El resumen del ejercicio dice «Partida de Lichess del …».
  - **Solo sale el nombre de usuario**; `privacidad.html` ya nombraba a los dos
    sitios y ahora dice también este uso. El usuario queda escrito **solo en
    ese aparato** (`errores_cuenta_web_v1`, fuera de `progreso-usuario.js`): no
    hace falta que viaje con la cuenta ni que lo lea su profesor.
  - Un usuario que no existe o un «espera un minuto» se dicen en palabras, no
    como error de la página. `verificar-tipos-pagina.js` lo prueba con un
    Lichess de mentira: qué se le pide (solo el usuario, las últimas 30), que
    la de Chess960 ni se mire, el ejercicio que sale y que la segunda vez no
    revise lo ya revisado.
- **Los errores de la apertura mandan a Aperturas.** Un error de las primeras
  10 jugadas (`enLaApertura`, por el número de jugada del FEN) es de la
  apertura, y ahí ayuda más saber la línea que el tema táctico.
  `ErroresPropios.lineaDeApertura()` busca en el banco de Aperturas
  (`js/aperturas-lineas.js`, que ahora carga Tipos) la línea que pasa por **la
  posición** del error —piezas, turno, enroques y al paso, no el orden de las
  jugadas—, así que sirve también para los ejercicios ya guardados, que no
  guardan la partida:
  - **«Caíste en una celada conocida»**: una celada del otro color que espera
    JUSTO la jugada que hizo el alumno (con blancas, 4.Cxe5 tras 3…Cd4 es la
    celada Blackburne; con negras, Cf6 frente a Dh5 es el mate del pastor). Se
    muestra la `idea` de la línea, que en todas las celadas está en tercera
    persona (la `clave` a veces le habla a quien pone la trampa).
  - **La teoría de su color**: una línea suya pasa por ahí; la jugada de la
    línea se dice solo si está entre las buenas del motor.
  - Si no hay línea, «Fue en la apertura (jugada N)» y el enlace a Aperturas.
  El enlace abre la línea directo (`aperturas.html?linea=<id>`). La ficha,
  además, cuenta cuántos errores fueron en la apertura y manda a la línea por
  la que más pasan. `verificar-errores-propios.js` prueba la búsqueda con
  posiciones del banco reproducidas con chess.js (ninguna inventada).
- **Los errores del final mandan a Finales.** Es el espejo de la apertura. Un
  error con poco material (cada lado con 13 puntos de piezas o menos y dos
  piezas como mucho, sin contar la apertura) es de un final, y su tipo (de
  torres, de peones, de damas…) sale del mismo clasificador de la preparación
  de rivales. Al cerrar se dice «Fue en un final de torres» con el enlace a un
  final del banco de Finales contra la máquina del mismo tipo
  (`finales.html?final=<id>`): el primero que todavía no logró, o el primero si
  ya los logró todos. Los de alfiles (mismo color, distinto color) van juntos:
  hay pocos de cada uno. La ficha cuenta cuántos fueron en un final y el tipo
  que más se repite.
  - **Una sola copia**: `esFinal()` y `tipoDeFinal()` se mudaron de
    `preparacion-analisis.js` a `preparacion-posiciones.js`, que carga Tipos
    (el análisis los toma de ahí). Como el análisis ahora los necesita al
    cargar, la carga diferida de `ErroresPropios.cargarWeb()` trae también
    posiciones y táctica si la página no las tiene (el hub no las tiene).
- **Los errores con el reloj encima.** Las partidas de Lichess y Chess.com
  traen el reloj de cada jugada, y `leerPgn()` ya lo leía. `deLaWeb()` guarda
  los relojes y el ritmo (`TimeControl`), y cada ejercicio, con cuántos
  segundos le quedaban **después** de hacer la jugada y con cuánto empezó
  (`reloj`, `base`). `apurado()`: con menos de 30 segundos o menos del 10 % del
  tiempo inicial (en una de 3 minutos, 18 segundos). Al cerrar: «La jugaste con
  12 segundos en el reloj…»; en la ficha: cuántos de los errores **con reloj**
  fueron apurados. Las partidas de la Academia no guardan el reloj, y sus
  errores no cuentan (ni a favor ni en contra).
- **«¿Cometes menos errores?»** La curva de errores por partida revisada, mes
  a mes (por el mes de la partida, en hora de Costa Rica), los últimos seis
  meses con alguna partida, y una frase si mejora o empeora: el último mes
  contra el promedio de los anteriores, con 3 partidas o más en cada lado (con
  menos, un mes malo lo decidiría todo).
  - **No sale de los ejercicios**: se guardan solo los últimos 60, así que los
    meses viejos darían de menos. Sale de las revisadas: cada una guarda ahora
    `{ r: cuándo se revisó, f: de cuándo es la partida, e1, e2: cuántos
    errores de cada nivel salieron }`. Las viejas (un texto con la fecha)
    siguen contando como revisadas pero no entran a la curva, y las que no se
    pudieron revisar (muy cortas, «desde el tablero») guardan `r` y `f` sin
    cuenta. Nada más lee el valor, solo que la clave esté.
  - `ErroresPropios.curvaEnPantalla()` la dibuja para la ficha (habla «tu») y
    para Informes (habla «su»): una sola copia. La barra es decorativa
    (`aria-hidden`): el número va escrito.
- **El hub avisa las partidas sin revisar.** «Hoy te toca» propone «4
  partidas sin revisar en «Tus propios errores» (2 de Lichess, 2 de la
  Academia)» (`ErroresPropios.sinRevisar`). Las de la Academia son las mismas
  de `traerPartidas()`; las de Lichess o Chess.com, solo si el alumno dejó su
  usuario, y a esos sitios se les pregunta **como mucho cada 6 horas**
  (`errores_web_mirada_v1` guarda cuándo y qué claves había): entre tanto se
  cuenta con esa lista, así que lo que revisa deja de contar sin volver a
  preguntar. Sin usuario guardado no sale nada hacia afuera. Si hay de la web,
  el enlace es `tipos.html?traer=web#errores`, que las trae y revisa solas una
  vez y saca el pedido de la dirección. El doble de `lib/doble-entreno.js`
  aprendió `.or()` y `.neq()` (filtrando de verdad) para probarlo, y `abrir()`
  acepta rutas de más (el Lichess de mentira).
- **La celada queda anotada en el ejercicio** (`celada`: el id de la línea del
  banco, o `null`), para que Informes cuente en la base las del grupo (ver
  «Las celadas en que más cae el grupo» en informes.md). Se anota al crearlo, y
  la ficha completa una vez los que se guardaron antes (`completarCeladas`):
  que la clave esté, aunque sea `null`, dice que ya se miró.

### Mis partidas de torneo

Las partidas más serias del alumno son las del torneo en tablero, y esas no
pasaban por ningún lado: ni Juegos ni Lichess las tienen. En «Tus propios
errores», debajo de «¿Juegas en Lichess o Chess.com?», está **«¿Jugaste en un
torneo en tablero? Anota tu partida»**: copia su planilla, dice fecha, color,
resultado y (si quiere) el torneo y el Elo del rival, y al guardar se revisa
esa sola con el motor, como «Revisa esta partida» (`?revisar=torneo:<id>`).

- **Cada jugada se comprueba con chess.js antes de guardar**
  (`ErroresPropios.leerJugadas`, pura, con su prueba en
  `verificar-errores-propios.js`). Acepta lo que escribe un alumno de verdad:
  español (R D T A C, enroque con ceros, coronar con `=D`) o inglés, con o sin
  números («1.», «1 », «12...»), o un PGN pegado (salta etiquetas,
  comentarios, variantes una dentro de otra, NAG y el resultado). Prueba la
  partida entera en inglés y, si no pasa, en español: no se adivina jugada a
  jugada, porque la R es rey en una y torre en la otra. Si ninguna pasa, dice
  la PRIMERA jugada que no se pudo hacer, con su número y color, de la
  notación que más lejos llegó. A la base llega en SAN inglesa, como las de
  Juegos: el resto del tipo 18 no distingue de dónde salió.
- **`partidas_torneo`** (migraciones `…203716_partidas_de_torneo` y
  `…203720_partidas_de_torneo_permisos`): la ven el alumno, sus profesores
  (`interno.alumnos_de` armado una vez), quien lo supervisa y administración;
  la escribe y la borra solo el alumno. No se edita: se borra y se vuelve a
  anotar (comprobado impersonando roles: el alumno anota y borra lo suyo y
  no a nombre de otro; su profesor la ve y no la puede borrar; otro alumno ni
  la ve; `anon` no tiene permiso). La base solo acota el tamaño (10 a 600 medias jugadas, evento de
  120 letras, Elo 0–3500): las jugadas las escribe el navegador y se pueden
  tocar desde la consola, así que quien las lee (Informes) vuelve a filtrar
  lo que no tenga forma de jugada.
- **O con una foto de la planilla** («📷 Leer la foto»). Usa el mismo lector
  que `lector-planilla.html`, que pasó de la página a `js/planilla-ocr.js`
  para que haya una sola copia: la foto va a la Edge Function
  `ocr-scoresheet` (Google Vision, con el tope diario de 30 fotos por persona;
  ver «El lector de planilla tiene tope diario» en cuentas-y-formularios.md),
  las palabras se ordenan por filas y cada una se lee como jugada o se
  cambia por la legal más parecida, comparada también en español («Ac9» es
  `Bc4`, no `Qc4`). **No se guarda sola**: las jugadas caen en el cuadro, en
  español, y las adivinadas llevan «?» (que `leerJugadas` salta como una
  anotación), con un aviso de cuáles son, para que el alumno las compare con
  su planilla antes de «Guardar y revisar». Lo que dice el servidor (el tope
  del día, la foto muy grande) se dice tal cual y el cuadro no se toca. Lo
  prueban `verificar-planilla-ocr.js` (sin navegador) y
  `verificar-tipos-pagina.js` (con un Vision de mentira).
- **El nombre del rival no se guarda.** Es de otra persona, que no tiene
  cuenta ni dio su consentimiento, y para revisar la partida no hace falta. El
  formulario lo dice.
- `traerPartidas()` las suma a las de Juegos y la práctica (clave
  `torneo:<id>`, origen «Partida de torneo», las 30 más recientes), así que
  «Buscar errores en mis partidas» y el aviso del hub también las cuentan. La
  fecha es un día de calendario: se guarda como mediodía en Costa Rica para
  que «del 4 oct» no se corra al día anterior.
- Debajo, «Tus partidas anotadas» con «Borrar» en dos pasos (la página no
  carga `js/avisos.js`): el primer clic pregunta, el segundo borra. Los
  ejercicios que ya salieron de ella se quedan.
- En Informes, al pie de «Errores de las partidas de…», **«Partidas de torneo
  que anotó»**: las últimas 10, cómo le fue (ganadas, tablas, perdidas), el Elo
  del rival, el torneo y las jugadas plegadas, en castellano (ver «Los errores
  de sus partidas» en informes.md).
- Lo prueban `verificar-tipos-pagina.js` (anotar con errores y bien, lo que
  llega a la base, la revisión sola de esa, la lista y el borrado) y
  `verificar-informes.js` (lo que ve el profesor, sin colarse otra alumna ni
  pintar HTML).

### Mi libreta de torneos

`libreta-torneos.html`: las partidas de torneo que el alumno anotó, **por
torneo** (el nombre sin mayúsculas ni espacios de más: «Abierto de Heredia» y
«abierto de heredia » son el mismo), el más reciente arriba. Se entra desde
Competir, desde «Tus propios errores» y, quien da clase, desde su panel.

- **Cada torneo**: las fechas, los puntos («Hiciste 1½ de 2 puntos», sin
  contar las partidas sin resultado) y **cómo cambió su Elo oficial** con
  `elo_historial`: el de la lista del mes en que empezó y el de la primera
  lista después del mes en que terminó (la FIDE publica el 1.º de cada mes).
  Sin las dos filas, no se dice nada.
- **Cada partida**, por ronda (el formulario ahora pide la ronda y propone la
  siguiente): color, resultado, Elo del rival, jugadas y lo que encontró el
  motor (los ejercicios `torneo-<id>-<media jugada>` de su `training_state`,
  con `deFilas()`, que no le cree nada al navegador).
- **Lo que pensaba** (`comentarios`, por media jugada desde 1): el alumno abre
  la partida en el tablero (`VisorLinea`, que ganó `alCambiar` para saber en
  qué jugada está) y escribe qué pensaba en ESA jugada. Se manda la UNIÓN con
  lo que ya había (como las funciones `set_*`) y se queda con lo que devuelve
  la base; vacío lo borra. La nota del tablero junta lo que pensaba y lo que
  dijo el motor de esa jugada, y la lista de comentarios queda a la vista
  (también al imprimir). Para el profe es la mitad que faltaba: el motor dice
  DÓNDE se equivocó; el comentario, por qué.
- **El permiso es por columna**: `grant update (ronda, evento, comentarios)`
  y la política `partidas_torneo_corrige` (solo lo suyo). Las jugadas, el
  color, el resultado y lo que dijo el motor no se tocan desde afuera.
- **Su profesor** la abre con `?alumno=` (lo que ve lo decide la RLS): sin
  formulario, y con **«Llevar sus errores a un plan de clase»** por partida.
  Ese armado pasó de Informes a `ErroresPropios.llevarAPlan()`: una sola
  copia para los dos.
- **Quien da clase sin `?alumno=`** ve las últimas 30 partidas que anotaron
  sus alumnos, cada una a su libreta en esa partida (`#partida-<id>`).
- **El aviso al profe** (`avisar_partida_torneo()`): cuando el navegador del
  alumno termina de revisar la partida que acaba de anotar, manda cuántos
  errores salieron. La función marca la partida (`errores`, `avisada_at`)
  ANTES de avisar, solo si es suya y no se había avisado: una sola vez, y
  nadie la dispara por otro. El aviso llega al celular de sus profesores con
  el enlace a esa partida en su libreta. Si la revisión se detuvo a la mitad,
  no se avisa: el número no sería cierto. En su panel, «Lo urgente» (a
  vigilar) cuenta las de la última semana (`partidasTorneo` de
  `js/pendientes.js`).
- **Se imprime**: el botón usa la impresión del navegador; el tablero y los
  botones no salen (`print:hidden`).
- Comprobado impersonando roles en SQL: el alumno comenta y pone la ronda,
  pero no cambia el resultado, las jugadas ni lo que dijo el motor; avisa una
  vez (la segunda devuelve `false`); su profesor no comenta ni avisa; otro
  alumno no corrige ni avisa; `anon` no ejecuta la función.
- Lo prueba `verificar-libreta-torneos.js` (la migración sin navegador; la
  libreta de la alumna, comentar y borrar, imprimir, la del profesor con el
  plan de clase y la lista de sus alumnos) y `verificar-tipos-pagina.js` (la
  ronda y el aviso al anotar).

### La partida contra lo que había preparado

Al anotar la partida, **«¿La preparaste?»** ofrece sus planes: los de
«Prepárate tú» (los últimos 8 quedan en ESTE navegador, `plan_propio_guardados_v1`,
solo el árbol de jugadas) y los que le mandó su profe (`planes_rival_alumno`,
lo que la RLS le deja leer: los suyos). Al guardar,
`ErroresPropios.compararConPlan()` recorre la partida por el árbol del plan
hasta la primera jugada que no está y dice **quién se salió** (él o su
rival), en qué jugada, cuál fue la última que coincidió y qué esperaba el
plan; o que siguió hasta el final del plan.

- **Se guarda la foto** en `partidas_torneo.preparacion` (como un acta): el
  plan propio vive solo en su navegador y el del profe puede borrarse, y lo
  que pasó en ESA partida no cambia. Pesa unos pocos bytes; la base acota a
  4000.
- **El plan tiene que ser del color con que jugó**: uno con negras para una
  partida con blancas se dice y no se guarda.
- Se dice en palabras (`textoPreparacion()`, a «tú» o a «él»), debajo de lo
  que encontró el motor al guardarla y en su libreta («🎯 La partida siguió
  tu preparación contra PedroP hasta 2.Cf3; ahí tu rival jugó 2…Cf6, que el
  plan no esperaba (el plan decía 2…Cc6)»). Lo guardado no se le cree al
  navegador: una «jugada» sin forma de jugada no se escribe.
- Por qué: prepararse bien también se aprende. Ver dónde se salió el rival
  (la línea que no esperaba) o dónde se salió uno mismo (la que no se sabía)
  dice qué preparar distinto la próxima vez.
- Lo prueban `verificar-errores-propios.js` (las dos funciones),
  `verificar-tipos-pagina.js` (las opciones, el color que no coincide, lo que
  se guarda y lo que dice), `verificar-libreta-torneos.js` (en la libreta) y
  `verificar-preparacion-rivales.js` (que «Prepárate tú» deja el plan).

### El tipo 19: Salva las tablas

El espejo de Remata la ventaja: al alumno le falta material, pero el motor
dice que se aguanta. Juega contra Stockfish a toda su fuerza y lo logra si
llega a **tablas por reglamento** (ahogado, repetición, 50 jugadas, material
insuficiente: lo que en Remata es escaparse, aquí es ganar) o si **aguanta las
jugadas del nivel sin bajar de −2,5**. Tres estrellas si nunca bajó de −1,5;
dos si pasó por la cuerda floja y aguantó igual; una con pista. Las reglas
están en `js/tipos-reglas-mas.js` (`juicioTablas`, `estrellasTablas`).

- **Una sola función para los dos juegos contra el motor.** Remata y Salva las
  tablas se juegan con `contraMotor(item, cfg)` en `js/entreno-tipos-mas.js`:
  cambian las reglas y lo que se dice, no el juego. Una segunda copia habría
  dejado a uno con los arreglos del otro a medias.
- **El material se cuenta después de la línea del motor.** La primera versión
  contaba el de la posición y se colaban posiciones en medio de un cambio:
  «9 puntos de material menos» con la dama del rival colgando, que se come en
  la jugada siguiente. Tampoco sirvió cortar la línea del motor en 4 medias
  jugadas: la cuarta podía ser otra captura que se recaptura enseguida. Ahora
  se recorre la línea hasta la **primera posición tranquila** (nadie en jaque
  y la jugada siguiente no es una captura) y ahí tiene que seguir faltando
  material; si la línea no se calma, no entra. El nivel lo pone lo que falta
  ahí: un peón (1) o dos puntos o más (2). El verificador guarda y compara
  los dos números (`materialAhora` y `material`).
- **Son pocas a propósito: 43** (20 y 23). De casi 2800 candidatas, en 2100
  el motor dice que ya están perdidas, y otras 65 solo «faltaba» material a
  mitad de un cambio: aguantar con material de menos es raro, y la gracia es
  que sea posible. Se sumó el nivel «Un peón menos» antes que bajar la
  exigencia.
- **De dónde salen**: los ejercicios de igualdad y de defensa de Lichess
  (desde el principio: hay que encontrar la línea que salva; y después de la
  solución, con la mejor respuesta del rival: hay que sostenerlo) y el que
  perdió material al final de cualquier ejercicio. El motor tiene que dar
  entre −0,8 y +0,5 a profundidad 18, sin mate, y a 12 casi lo mismo. Con el
  corte en −2,5 queda un peón y medio de margen para la evaluación corta del
  navegador (ver Remata).
- `node herramientas/tipos-generar.js --solo tablas` rehace solo este banco. En
  la clase en vivo trae «🎯 Practicar».

**Al tocar los bancos, las reglas o la página, correr**:

    node herramientas/tipos-generar.js          # solo si cambian los bancos (necesita Stockfish)
    node herramientas/verificar-tipos.js        # los bancos y las reglas, sin navegador (~1 min)
    node herramientas/verificar-tipos-pagina.js # la página, jugada de punta a punta (Remata, con un motor de mentira)

El primero de los verificadores vuelve a comprobar con las reglas de la página
todo lo que cada banco promete y recalcula las tablas de finales; el segundo
juega cada tipo en un navegador (Con lo justo, escribiendo cada jugada que
elige la tabla exacta) y mide lo que se ve, no las clases. Está probado que
fallan de verdad: cambiando la opción buena de un Detective, un mínimo, un
material y una respuesta de Fotografía saltan 7 comprobaciones; en Siete
diferencias, cambiando una casilla del cambio, una evaluación de B o los
enroques de B saltan las 3 que corresponden.

## La práctica de los cursos de finales cuenta

- `js/finales-100.js` (la práctica contra el motor de «El mapa de los
  finales» y de «Estrategia en el final») registraba `finales100`, que no
  estaba en el CHECK: la base rechazaba la fila callada y esas prácticas no
  sumaban a la meta del día, la racha ni los logros.
- Migración `20260929152955_finales100_cuenta_en_su_curso.sql`: suma
  `finales100` al CHECK. La fila lleva el curso (`detail.curso`, del
  `data-course` de la página) y `tiempo_por_seccion()` la cuenta dentro de
  `curso:<slug>`, donde ya estaba el tiempo de esa página: en Informes no sale
  una sección suelta sin minutos.
- El correo a la casa la nombra «Finales de curso contra el motor» en «En qué
  trabajó» (`ACTIVIDADES` de `informe-html.ts`; hace falta redesplegar
  `informes-encargados` para verlo).
- No sube `ACTIVIDADES_ALCANZABLES` de Logros: los cursos se compran aparte,
  y exigirla dejaría «Las probaste todas» fuera del alcance de quien no los
  tiene.

## La dificultad que se ajusta sola (Ejercicios por tema)

- Cada tema arrancaba cerca del nivel del alumno (Elo del diagnóstico − 300,
  o lo que eligió en el selector) y después se quedaba ahí: al que le salía
  todo le seguían tocando ejercicios que ya no le enseñaban nada, y el tema va
  de menor a mayor, así que al que se trababa le tocaban más difíciles.
- `js/dificultad-adaptable.js` cuenta y decide: **5 limpios seguidos** (sin
  error ni pista) suben un escalón del selector; **3 con error o pista entre
  los últimos 4** bajan uno. Tras un cambio la cuenta vuelve a cero. Qué es
  un escalón lo pone la página (`DESDE_OPCIONES`).
- `js/entreno-temas.js` lo aplica: guarda el escalón nuevo como si lo hubiera
  elegido (`entreno_temas_desde`), el selector lo muestra, y
  `#nivel-ajuste` (`role="status"`) lo dice en pantalla. Al cambiar, el
  siguiente se busca **desde el principio** del tema: hacia adelante solo
  quedan los más difíciles, y bajar no bajaría nada.
- **No ajusta**: el repaso, un tema sin rating (la táctica de la casa) ni una
  dificultad fijada con `?desde=` (la puso la tarea o el plan). Elegir a mano
  en el selector reinicia la cuenta.
- Lo prueba `herramientas/verificar-dificultad-adaptable.js`, incluido el
  caso en que se nota buscar desde el principio (arrancó en 1400 y se traba).

## El primer paso después del diagnóstico

- En los datos, de 52 alumnos que hicieron el diagnóstico, 17 no volvieron a
  entrenar y 19 lo dejaron al primer o segundo día. El resultado terminaba en
  un plan de cuatro semanas para leer y nada que hacer ya.
- `entreno/diagnostico.html` pinta arriba de todo `#result-primer-paso`: lo
  que toca hoy (`PE.hoyDelPlan()`, el mismo de «Hoy te toca» y del panel),
  cuántos ejercicios pide la meta del día (`Logros.META_DIARIA`) y cuántos
  lleva hoy (`Logros.cargar()`), con un botón directo al ejercicio. En la
  semana 1 sin nada hecho dice «Tu primer paso: hoy mismo»; después, «Esta
  semana te toca» y cuánto lleva ahí. A un visitante no se le pinta.
- Lo prueba `verificar-entreno-repaso.js`.

## La meta de la semana, la que elige el alumno

> Vive en `js/hoy-te-toca.js`, así que sale en el hub de Entrenamiento y en el
> panel del alumno.

- **La meta del día la pone el sitio** (los 5 ejercicios de la racha) y la
  «Meta de Elo» la pone el plan del diagnóstico. Al alumno le faltaba una que
  fuera suya. En «Hoy te toca», debajo de las siete barras de «Tu semana»,
  dice «🎯 Ponte una meta para esta semana»: cuántos días entrena (de 2 a 7) y
  cuántos ejercicios hace (de 20 a 200), de lunes a domingo.
- **Con la meta puesta**: «🎯 Tu meta de la semana: 2 de 4 días · 42 de 50
  ejercicios. Quedan 4 días para el domingo.», con dos barras rotuladas
  («Días», «Ejercicios») que dan el número también al lector de pantalla
  (`aria-valuetext`). Cuando se cumple, lo celebra. El domingo dice que es el
  último día, y si los días ya no alcanzan lo dice sin regañar: «igual, cada
  ejercicio suma».
- **Un día cuenta igual que en la racha**: con `Logros.META_DIARIA`
  ejercicios. Dos reglas distintas para «un día» confundirían al alumno.
- **No hace falta otra función en la base**: la semana de lunes a hoy nunca
  tiene más de siete días, y `entreno_mi_semana()` ya da los últimos siete,
  día por día y en hora de Costa Rica (la clave `dias`). La cuenta es
  `HoyTeToca.avanceMetaSemana(dias, metaDiaria)`. La meta sale aunque no
  haya entrenado nada en dos semanas (justo cuando más sirve), pero no si la
  base no responde.
- **Se guarda en `meta_semana_v1`**, que viaja con la cuenta
  (`js/progreso-usuario.js`, `ultimaEscritura`): se la pone en la computadora
  y la ve en el celular. **No se le cree a lo guardado**: un número que no
  está entre las opciones es como no tener meta.
- El formulario va dentro de la caja, no en un `prompt()`: el botón dice si
  está abierto (`aria-expanded`), el foco va al primer campo y vuelve al botón
  al cerrar. «Quitar la meta» solo sale si hay una.
- Lo prueba `verificar-entreno-repaso.js` (`metaSemana`): la cuenta un
  miércoles y un domingo, ponerla, cambiarla, quitarla, cumplida y una meta
  tocada desde la consola. Contando la semana desde el domingo en vez del
  lunes, salta.

## Tu mes en ajedrez

> Vive en `js/tu-mes.js`. Lo pinta `logros.html` (sección `#mes`) y lo anuncia
> «Hoy te toca» los primeros días de cada mes.

- **Qué es**: lo que el alumno entrenó en un mes, contado por la base, con un
  texto para compartir con la familia. En Logros se elige el mes (de hoy hacia
  atrás, hasta 24 meses; nunca uno que todavía no llega) y «📤 Compartir mi
  mes» usa el compartir del celular o, si no hay, lo copia y avisa. No se
  manda a ningún lado: lo comparte el alumno.
- **La cuenta es `entreno_mi_mes(alumno, p_mes)`** (migración
  `20261004051405`, y `20261004051442` para que `alumno` en null sea «yo»,
  como al omitirlo). `SECURITY INVOKER`: la RLS de `training_progress` decide,
  y solo lee dos meses de UN alumno. Meses y días de Costa Rica; un día cuenta
  con 5 ejercicios, el mismo corte de la racha, y `racha_mejor` es la tirada
  más larga dentro del mes. Comprobado impersonando a un alumno: su
  septiembre dio 876 ejercicios en 7 días (lo mismo que la cuenta directa), y
  el de otro alumno, todo en cero.
- **Cada número dice lo que es, y lo que no hay no se dice**: sin ejercicios
  que digan cómo salieron no hay porcentaje de limpios, sin mes anterior lo
  dice («este es el primero»), y un mes vacío no ofrece compartir. Las líneas
  no dicen «tú» ni «él», porque las mismas sirven en pantalla y para la
  familia. Lo más entrenado usa los nombres de `js/tiempo-secciones.js`, que
  tiene la misma tabla que `informes-encargados` (lo vigila
  `verificar-tiempo-secciones.js`). Ahí faltaba `tactica` y salía «Tactica»:
  se agregó «Táctica de ataque» en las dos y se volvió a desplegar la función
  (versión 23), así que el informe a la casa también lo dice bien.
- **En «Hoy te toca», del día 1 al 7**: «📅 Tu septiembre en ajedrez: 876
  ejercicios en 7 días. Míralo y compártelo →» a `logros.html?mes=…#mes`. Solo
  si el mes que pasó tuvo algo; después del día 7 ni siquiera se le pregunta a
  la base. Logros baja hasta `#mes` a mano, porque la página se destapa
  después de cargar.
- Lo prueba `verificar-tu-mes.js`, con el reloj del navegador fijo (en hora de
  Costa Rica: el 4 a las 8 p. m., en UTC ya es el 5). Dejando que el aviso
  salga todo el mes, o abriendo un mes del futuro, salta.
