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
- **`ACTIVIDADES_ALCANZABLES` es 13, no 14.** El CHECK de `training_progress`
  tiene 14 actividades, pero `desafios` está declarada sin ningún uso real
  (`entreno/desafios.html` registra como `'practicar'`): pedir las 14 para el
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
  `js/curso-partidas.js` siguen sin poder escribir en `training_progress` (no
  están en el CHECK): **no** se tocaron acá, porque emparejarlos con
  `curso`/`leccion` como espera `cursos_temas` de `informes_resumen_alumnos()`
  es un cambio aparte, no de esta tanda.
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

## El hub de Entrenamiento y sus grupos

`entreno/index.html` reparte los accesos en **Fundamentos** (Mates,
Aprender, Coordenadas, Desafíos), **Practicar** (Ejercicios por tema, Practicar,
Precisión posicional), **Entreno** (Aperturas y celadas, 4×4, Visualización) y
**Tipos de entrenamiento** (una sola tarjeta que abre su ficha, ver «Los Tipos
de entrenamiento»).

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

## Estudio: una ficha por idea, con su mapa y su posición

`entreno/estudio.html` (tarjeta **"📚 Estudio"** en `clases.html` → grupo
"Aprender") son 56 fichas de estudio: 12 aperturas, 12 defensas, 16 temas
tácticos y 16 conceptos. Cada una es **una sola pantalla**: la idea principal
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


### Lo demás que hace la página

- **Cada ficha tiene su enlace** (`estudio.html?ficha=<id>`), para mandarla por
  WhatsApp. Un id que ya no existe cae a la lista, no a una ficha en blanco.
- **Se imprime.** Una hoja de estilos de impresión deja solo la ficha —sin
  encabezado, sin lista, sin buscador, sin botones— y acomoda el mapa a dos
  columnas.
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
al imprimir salga la ficha y no la lista, y que la página **se vea**: sin CSS
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
el grupo "Practicar" del hub de Entrenamiento) es un banco de 96 posiciones
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
  hace falta ninguna tabla nueva. **No escribe en `training_progress`**, la
  misma decisión que ya tomó Confites: esa tabla tiene el CHECK de
  actividades permitidas y sumar una nueva ahí es una migración aparte que
  esta tanda no pidió. El tiempo sí se registra, como en toda página de
  Entreno: `js/tiempo-plataforma.js data-activity="precision-posicional"`, que
  no tiene ningún CHECK.
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
- `diagnostico-de-nivel.pdf` (raíz) es el diagnóstico en papel, con sus
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
alumno la conteste en papel; este es el **banco entero** —todas las preguntas (583 desde la versión 5), área
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

#### Cómo se rehace

- Preguntas de Lichess: exportar candidatos (la consulta está en la cabecera
  del script) y `STOCKFISH=/usr/games/stockfish node
  herramientas/diagnostico-lichess.js candidatos.json`. El análisis del motor
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
  "Herramientas" de `clases.html` y en `admin.html`, y la página lo vuelve a
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
- `examen-de-arbitraje.pdf` (raíz) es el banco entero en papel, tipo libro:
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
  se quedaría con la PEOR marca de los dos aparatos. **No escribe en
  `training_progress`** —esa tabla tiene el CHECK de actividades y sumar una es
  una migración aparte—; el tiempo sí se registra con
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

## Los Tipos de entrenamiento

`entreno/tipos.html` (grupo y tarjeta **"🧠 Tipos de entrenamiento"** del hub)
es una ficha con siete entrenamientos que no son «encuentra la mejor jugada»,
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
  `minPorClave`). Un ejercicio cuenta como resuelto con una estrella. **No
  escribe en `training_progress`** (el CHECK de actividades, como Confites y el
  Sonar); el tiempo sí, con `data-activity="tipos"`. Esa sección está en las
  dos tablas de nombres (`js/tiempo-secciones.js` y la de
  `informes-encargados`); la función del correo tiene que volver a
  desplegarse para que el correo a la casa la nombre.

**Al tocar los bancos, las reglas o la página, correr**:

    node herramientas/tipos-generar.js          # solo si cambian los bancos (necesita Stockfish)
    node herramientas/verificar-tipos.js        # los bancos y las reglas, sin navegador (~1 min)
    node herramientas/verificar-tipos-pagina.js # la página, jugada de punta a punta

El primero de los verificadores vuelve a comprobar con las reglas de la página
todo lo que cada banco promete y recalcula las tablas de finales; el segundo
juega cada tipo en un navegador (Con lo justo, escribiendo cada jugada que
elige la tabla exacta) y mide lo que se ve, no las clases. Está probado que
fallan de verdad: cambiando la opción buena de un Detective, un mínimo, un
material y una respuesta de Fotografía saltan 7 comprobaciones; en Siete
diferencias, cambiando una casilla del cambio, una evaluación de B o los
enroques de B saltan las 3 que corresponden.
