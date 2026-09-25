# El sitio y su infraestructura

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: cómo se sirve, se despliega, se respalda y se encuentra el sitio.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

## El dominio: `www` manda al dominio sin `www`

`worker.js` redirige `www.ajedrez-integral.com` a `ajedrez-integral.com` con un
301. **No es una preferencia de estilo.** Para el navegador son **dos orígenes
distintos**, así que si los dos sirvieran el sitio, quien entrara por `www`
tendría:

- otro `localStorage` — o sea otro progreso, otro tema y otra clase elegida;
- **otro service worker**, es decir una segunda app instalable con el estado en
  blanco;
- **otra suscripción de avisos push**, que no recibiría nada de la primera.

Y de paso: todos los `canonical`, el `sitemap.xml` y el Open Graph apuntan al
dominio sin `www`, así que servir las dos direcciones sería contenido duplicado.

- **Las dos correcciones del worker se resuelven en UNA respuesta.** Quien entra
  por `www` a una dirección vieja de "Los 100 finales" recibe un solo 301, ya
  con el dominio y la dirección arreglados. Encadenar dos redirecciones —una
  para el dominio y otra para la dirección— es el error natural si cada arreglo
  devuelve lo suyo, y le cuesta un viaje de más a quien entra.
- Lo único que hay que hacer **fuera del repositorio** es que el nombre
  exista. En Cloudflare son dos cosas, en este orden: un **CNAME `www` →
  `ajedrez-integral.com` con el proxy encendido** (la nube naranja; en "Solo
  DNS" el tráfico no pasa por Cloudflare y el worker nunca ve la petición) y
  una **ruta `www.ajedrez-integral.com/*`** apuntando al worker. La ruta
  necesita que el nombre ya exista en el DNS, por eso ese orden.
  El camino corto es "Añadir dominio" en la pestaña Dominios del worker, que
  hace las dos cosas de una; pero acá ese diálogo respondía "ninguna zona
  coincide con www.ajedrez-integral.com" aunque la zona estaba en la misma
  cuenta, así que queda escrito el de dos pasos, que no depende de esa
  búsqueda.
- **Al tocar `worker.js`, correr `node herramientas/verificar-worker.js`.** No
  necesita ni Cloudflare ni internet: el worker es una función que recibe una
  petición y devuelve una respuesta, así que se la llama y se mira qué contesta,
  con un `env.ASSETS` de mentira. Lo que se comprueba es lo que no se ve: que la
  redirección **conserve la dirección completa y sus parámetros**. Una que se
  coma lo que va después del dominio manda a la portada a quien venía a un
  curso, y de eso no se entera nadie salvo quien se quedó mirando la página que
  no era.

### El correo del dominio

El dominio **manda y recibe por caminos distintos**, y conviven porque viven en
nombres distintos. Confundirlos es lo único que puede romper esto:

- **Sale** por Resend, con sus registros en **`send.ajedrez-integral.com`** (el
  MX y el SPF) y la firma en `resend._domainkey`. Es por donde salen los
  informes a la casa y los avisos de cobro.
- **Entra** por Cloudflare Email Routing, con sus tres MX, su SPF y su DKIM
  (`cf2024-1._domainkey`) en el **dominio raíz**. No es un buzón: reenvía a una
  cuenta de correo de siempre.

**No se borran los registros de `send.` ni el `resend._domainkey`.** Sin ellos
el sitio deja de mandar los informes y los avisos, y —como casi todo lo de
correo— no da ningún error: simplemente dejan de llegar.

- **`informes@` es la dirección que más importa.** El sitio manda desde ahí a
  las familias, o sea que es correo que invita a contestar. Antes de esto el
  raíz no tenía ningún MX: la respuesta de una madre rebotaba y no se enteraba
  nadie, ni ella ni quien daba la clase.
- **El catch-all va en "Enviar a un correo", no en "Descartar".** "Descartar"
  no rechaza: acepta el correo y lo tira, así que quien escribió mal la
  dirección se queda convencido de que llegó. Es la misma clase de falla
  callada contra la que están escritas media docena de decisiones de este
  archivo.
- **Un solo SPF por nombre.** Si algún día manda otro servicio desde
  `@ajedrez-integral.com`, su `include:` va DENTRO del TXT que ya está, nunca
  en un segundo registro: con dos, los dos se invalidan y el correo empieza a
  caer en spam sin avisar.
- El reenvío solo trae correo. Para **responder** desde una dirección del
  dominio hace falta además un SMTP —Gmail → "Enviar como", con
  `smtp.resend.com` y una API key de Resend—, y eso es de cada persona, no del
  sitio.

## El sitio se instala como app (PWA)

`manifest.json`, `sw.js`, `js/pwa.js` y los iconos de `img/app/` hacen que el
sitio se pueda instalar en el celular: queda un icono, abre a pantalla completa
sin barra del navegador y entra directo a la Academia (`start_url` es
`/clases.html`, que ya redirige al login sin sesión).

Es además **el cimiento de la app de Google Play**: la ruta elegida es una TWA
—la app *es* esta PWA corriendo en el motor de Chrome—, así que publicar en el
sitio actualiza la app sin pasar por la tienda. Lo que falta para eso son
trámites, no código, y está escrito en
`herramientas/plantillas/LEEME-app-android.md` con su `assetlinks.json` listo
para pegarle la huella de firma.

### El service worker es deliberadamente tonto

**La red va SIEMPRE primero y la caché es solo la red de seguridad para cuando
no hay señal.** Servir de la caché primero haría que el sitio arrancara más
rápido, y abriría la puerta a la peor falla que tiene este sitio: **HTML nuevo
con CSS viejo**. El CSS se compila y los archivos no llevan huella en el
nombre, así que una hoja vieja en caché deja la página sin la mitad de sus
clases — y eso **no da error**: simplemente se ve mal, que es exactamente
contra lo que existe `verificar-css.js`.

Lo que el service worker no toca nunca:

- nada que no sea de este dominio (Supabase, los CDN): ni lo mira;
- nada que no sea `GET`;
- `cursos/protegido/` y `cursos/recursos/` — guardar el contenido de la
  Academia o el material de uso docente sería dejarlos en el teléfono después
  de cerrar sesión;
- las respuestas que no vengan bien: un 404 no se guarda.

**`sw.js` y `manifest.json` llevan `Cache-Control: no-cache` en `_headers`.** Si
el navegador se queda con un `sw.js` viejo, la app deja de actualizarse y no hay
forma de avisarle a nadie: sigue sirviendo lo de antes sin dar ningún error.

### Los iconos no son el favicon

El favicon del sitio es un emoji, y un emoji no sirve de icono de app: cada
sistema lo dibuja distinto y las tiendas piden un PNG. `node
herramientas/pwa-iconos.js` dibuja el caballo del juego de piezas que el sitio
ya usa (leído de `js/finales-100.js` vía `lib/tablero-svg.js`), en ámbar sobre
el azul del encabezado. **Van dos de 512 y no uno**: Android recorta el icono en
círculo, así que el `maskable` lleva bastante más margen — sin eso le come las
orejas al caballo.

### La cabecera va en TODAS las páginas

`python3 herramientas/pwa-cabecera.py` pone el `manifest`, el `theme-color`, el
icono de iPhone y `js/pwa.js` en las 76 páginas del sitio, no solo en la
portada: la gente entra por donde sea —un enlace a un curso, lo que le mandaron
por WhatsApp— y el celular **solo ofrece instalar si la página por la que entró
lo declara**. Se puede correr todas las veces que se quiera; reconoce lo suyo
por las marcas `<!-- app: inicio -->`.

El aviso de instalación de `clases.html` (`#instalar-app`) **arranca oculto** y
`js/pwa.js` lo destapa solo cuando el navegador confirma que se puede instalar.
Un botón que no haría nada es peor que ningún botón.

**Se muestra UNA vez.** Antes salía en cada carga de la página, porque el
navegador dispara `beforeinstallprompt` cada vez: quien entraba a diario lo veía
a diario, y un cartel que se repite deja de leerse y empieza a molestar. Ahora
se apunta en `localStorage` (`app_instalar_v2`, con `visto` y `rechazado`) y solo
vuelve en un caso: **quien apretó "Ahora no" lo ve de nuevo una semana después**,
por si en ese momento le venía mal. Quien lo dejó pasar sin tocar nada tampoco lo
vuelve a ver — no contestar también es una respuesta. Al instalarse se borra todo,
por si algún día la desinstala.

**Y durante meses nada de eso se cumplió, porque el cartel no se escondía.** El
atributo `hidden` y la clase `flex` de Tailwind tienen la MISMA especificidad
(`[hidden]:where(:not([hidden=until-found]))` vale 0,1,0 — `:where` no suma
nada), y la utilidad va después en la hoja: gana `.flex`. El cartel lleva las
dos cosas, así que salía en cada carga y "Ahora no" no lo hacía desaparecer. Lo
arregla una línea en `css/styles.css` — `[hidden] { display: none !important; }`
—, que va ahí y no en la página porque el atributo tiene que significar lo mismo
en todo el sitio.

**Y no daba ningún error, ni siquiera en la comprobación**: `verificar-pwa.js`
preguntaba por `elemento.hidden`, la propiedad, que sí estaba puesta. Daba verde
sobre una página rota. Ahora pregunta por `getComputedStyle(...).display`, que
es lo que ve quien entra. **Al comprobar que algo se esconde, mirar la pantalla,
nunca el atributo.**

**Al tocar cualquiera de estas piezas, correr `node
herramientas/verificar-pwa.js`** (con el sitio en localhost:8777 y playwright).
Comprueba el manifest, que los iconos midan lo que prometen, que las 77 páginas
lo declaren, que el service worker tome el control y —lo que de verdad
importa— que **no guarde** `cursos/protegido/`, `cursos/recursos/` ni nada de
otro dominio, y que sin red una página caiga en `offline.html`.

- **La red se corta apagando un servidor, no con `setOffline()`.** En el
  Chromium de playwright, `contexto.setOffline(true)` no alcanza a las
  peticiones que hace el propio service worker (tampoco `route()`): su
  `fetch()` llegaba igual al servidor, recibía el 404 de la página inexistente y
  nunca pasaba por la rama de «sin conexión». La prueba fallaba sobre un
  `sw.js` sano — y uno roto en esa rama habría fallado igual, o sea que no
  medía nada. Ahora esa parte levanta su propio servidor estático, deja que el
  service worker tome el control y lo apaga: el fallo de red es de verdad.
  Comprobado que discrimina: quitándole a `sw.js` el `caches.match("/offline.html")`,
  salta.

### Avisos push: los manda el sitio, no la tienda

**Los avisos no son de la app, son del sitio**, y por eso funcionan igual en la
PWA instalada desde el navegador y dentro de la TWA. (Acá quedó escrito una vez
lo contrario —"una TWA no las trae"— y era falso: lo único que la TWA agrega es
que salgan con el nombre y el icono de la Academia en vez de con los de Chrome,
y eso se pide con la *delegación de notificaciones* de Bubblewrap; está en
`herramientas/plantillas/LEEME-app-android.md`.)

- **El permiso se pide SOLO al apretar el interruptor**, nunca al cargar la
  página. El navegador deja pedirlo **una vez por aparato**: si se pide de
  entrada y dicen que no, se perdió el único tiro y ya no hay forma de volver a
  preguntar desde el sitio. El interruptor vive en `configuracion.html` →
  "Avisos en el celular".
- **La fila es por aparato, no por persona.** `push_suscripciones` se escribe
  con `upsert ... onConflict: "endpoint"`: la compu y el celular se encienden
  por separado, y volver a suscribir el mismo aparato actualiza en vez de dejar
  dos filas apuntando al mismo lugar.
- **Apagar borra la fila ANTES de darse de baja.** Al revés, si el borrado
  falla queda un endpoint muerto al que el sitio le sigue mandando.
- **El navegador renueva la suscripción por su cuenta** y avisa al service
  worker (`pushsubscriptionchange`). Si no se vuelve a guardar, el aparato deja
  de recibir **en silencio** — nadie se entera hasta que alguien pregunta por
  qué no le llegan los avisos. `Notificaciones.atenderRenovaciones()` la vuelve
  a guardar sola, y cualquier página que cargue `js/notificaciones.js` la
  atiende: busca la sesión por su cuenta a propósito.
- **`js/notificaciones.js` va SIN `defer`.** Con `defer` corre después de
  parsear el HTML, o sea después del script del cuerpo que lo llama: la tarjeta
  de avisos salía vacía cuando la sesión resolvía rápido, sin dar ningún error.
  Misma carrera que `js/adaptive-mode.js`.

#### El cifrado se escribió a mano, y por eso se prueba

La Edge Function `notificar` implementa VAPID (RFC 8292) y el cifrado
`aes128gcm` (RFC 8291/8188) con Web Crypto, sin ninguna dependencia de npm:
`webpush.ts`. **Un mensaje mal cifrado no da error en ninguna parte** — el
servidor de push lo acepta, lo reenvía y el teléfono lo descarta callado.

- **El par VAPID lo genera la propia función la primera vez** y lo guarda en el
  Vault (`push_vapid_publica` / `push_vapid_privada`). No está escrito en
  ninguna migración, ni en el repositorio, ni se imprime nunca.
- **La tanda va firmada**, igual que los informes a la casa y los avisos de
  cobro: `verify_jwt` en `false` y un secreto del Vault
  (`tanda_push_secreto`) que la función vuelve a leer con la service role.
  Comprobado: con una firma inventada responde 401.
- **Quién puede avisarle a quién lo decide la RLS, no un `if`.** Para la acción
  `avisar`, la función lee `profiles` con el JWT de quien llama: solo se le
  manda a los ids que la RLS le devuelve. Un profesor no puede meterle una
  notificación en el teléfono a un alumno que no es suyo.
  - **Pero antes se exige dar clase.** La RLS de `profiles` a un alumno le
    devuelve también a sus compañeros y a sus profesores, así que sola no
    alcanzaba: cualquier alumno podía mandarle a su clase un aviso con la
    marca de la Academia. Y **el enlace del aviso solo puede ser del propio
    sitio** —la función lo exige y `sw.js` lo vuelve a comprobar al abrirlo—:
    uno de afuera con esa marca encima es la puerta perfecta para un engaño.
- Los avisos salen solos de dos disparadores: `class_sessions` (empezó la
  clase) y `desafios` (te retaron), los dos por `pg_net`.
- Un endpoint que responde 404 o 410 está muerto: se marca `activa = false` en
  vez de seguir intentándolo.

**Al tocar cualquiera de estas piezas, correr `node
herramientas/verificar-notificaciones.js`** (con el sitio en localhost:8777 y
playwright). Son dos partes, por dos peligros distintos: cifra un mensaje con
llaves de aparato de verdad y lo descifra de vuelta haciendo el papel del
navegador (y comprueba que dos envíos del mismo texto salgan distintos: si
salieran iguales, se estaría reusando la llave efímera); y abre
`configuracion.html` en un navegador de verdad para ver **cuándo** se pide el
permiso, qué se guarda y qué se borra. Esa segunda parte le pone un servicio de
push de mentira porque Chromium sin cabeza no tiene ninguno detrás — lo que se
comprueba ahí es qué hace la página, no que Chromium alcance a Google.

## El CSS va compilado, no por CDN

`css/tailwind.css` lo genera `node herramientas/css-construir.js` (después de
`npm install tailwindcss@3`). Antes el sitio cargaba `cdn.tailwindcss.com`, que
es el modo de juguete de Tailwind: baja unos 400 KB de JavaScript y **compila el
CSS dentro del navegador, en cada carga y de cada visitante** — de ahí el
parpadeo sin estilos al entrar. Compilado, el sitio entero son 50 KB de CSS que
el navegador cachea.

- **La paleta ya no se compila dentro de cada clase: son variables CSS.**
  Estuvo copiada en el `<head>` de las 73 páginas, después vivió en
  `herramientas/css-construir.js`, y hoy vive en `js/temas-plataforma.js` —
  porque dejó de haber UNA paleta y hay una por tema (ver «El tema de toda la
  plataforma»). Lo que el generador le pasa a Tailwind es
  `rgb(var(--c-brand-800) / <alpha-value>)`, y las variables de cada tema se
  escriben al final del archivo compilado.
- `inscripcion.html` lleva su propio `css/tailwind-inscripcion.css`: tiene otro
  diseño y su `brand` es verde, así que los dos no pueden convivir en un mismo
  archivo.
- **Al agregar una clase que no estaba en ninguna parte del sitio, hay que
  volver a compilar**: el compilador solo escribe las clases que encuentra
  leyendo el código. Ese es el riesgo de este cambio, y por eso existe la
  comprobación de abajo.
- Se quitó `cdn.tailwindcss.com` del `script-src` en `_headers`.

### Comprobar que no falte ninguna clase

`node herramientas/verificar-css.js` (con el sitio servido en localhost:8777).
**No lee los archivos**: abre 49 páginas en un navegador de verdad, deja correr
el JavaScript, enciende el modo oscuro y el adaptado, abre los `<details>`,
destapa lo escondido, y recorre el DOM juntando **todas** las clases que
quedaron puestas — unas 14.500. Después comprueba que cada una esté definida en
alguna de las hojas que el navegador cargó.

Es así porque el peligro es justamente el que no se ve leyendo el código: una
clase armada en JavaScript, o que solo aparece después de una interacción,
falta en el CSS y la página se ve mal **sin que nada falle ni avise**.

- Leer el CSS a mano no sirve: los caracteres raros van escapados
  (`grid-rows-[repeat(8,minmax(0,1fr))]` se escribe con `\2c ` en lugar de la
  coma) y Tailwind 3.4 escribe el modo oscuro como
  `.dark\:text-white:is(.dark *)`, con los dos puntos de la variante escapados
  y los de `:is` sin escapar. Por eso las clases conocidas se piden al
  navegador, que ya las tiene interpretadas.
- Las clases que **a propósito** no definen ningún estilo —marcadores de estado
  y ganchos para `querySelectorAll`, como `filter-btn` o `color-opt`— están
  listadas en `SIN_ESTILO`. Si aparece una nueva que no hace nada, va ahí.
  - **Que una clase no tenga CSS no quiere decir que esté muerta.** Los cuatro
    `total-*` de los exámenes de arbitraje parecían restos: no los encuentra
    ningún grep, porque el nombre se **arma concatenando** (`'.total-' +
    n.clave` sobre `NIVELES_EXAMEN`). Son ganchos vivos, y de los que importan:
    cada `<span>` dice cuántas preguntas trae ese examen y el número lo rellena
    el propio banco con `totalPara(techo)`, así que la página no puede prometer
    24 preguntas y armar otra cantidad. Antes de dar una clase por muerta, hay
    que buscarla también por pedazos.
- La primera corrida encontró **huecos de la paleta que ya estaban muertos con
  el CDN**: `bg-accent-50` y `hover:text-accent-300` no pintaban nada porque el
  ámbar solo tenía tres tonos, y a `inscripcion.html` le faltaban `brand-300`,
  `brand-400`, `brand-950` y el ámbar entero. Se agregaron.

## Las librerías de terceros tampoco vienen de un CDN

Por la misma razón que el CSS, y con más consecuencias: `js/vendor/supabase.js`
está **en el repositorio**, no pedido a jsDelivr. Estaba escrito así en las 77
páginas que lo cargan:

    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

Eso es un **rango**, no una versión, y sin `integrity`. O sea que cada visita
ejecutaba lo que hubiera publicado ahí en ese momento, con la sesión de quien
entrara —un alumno, un profesor, quien administra—, y con acceso al cliente que
guarda el token. No es un peligro teórico: es lo que pasó con polyfill.io en
2024. Y **no habría dado ningún error**: las páginas se seguirían viendo igual
mientras las sesiones se van, que es el fallo callado de siempre pero con todo
el sitio adentro.

- **Vive al lado de Stockfish**, en `js/vendor/`, que ya estaba servido así.
- Se trae con `node herramientas/vendor.js`, después de `npm install`. Queda **byte a byte como viene de
  npm** —sin cabecera de comentario— para que se pueda comparar contra el
  paquete; la versión no se anota aparte porque el bundle la lleva dentro
  (`supabase-js/2.116.0`).
- **chess.js (0.10.3) y three.js (r128) siguieron el mismo camino.** Venían de
  cdnjs, con la versión fija pero sin `integrity`, en 43 páginas y en
  `inscripcion.html`. Además del riesgo de lo que se publique ahí, el CDN caído
  tampoco avisa: sin chess.js la portada se queda sin el tablero de prueba
  («Falta el tablero o la librería chess.js» en la consola y nada en la
  pantalla). Ahora viven en `js/vendor/chess.js` y `js/vendor/three.min.js`,
  byte a byte como vienen de npm, y **cdnjs salió de la CSP**: era lo único que
  se pedía de ahí. La lista de librerías está UNA vez, en
  `herramientas/lib/librerias-vendor.js`: la leen `vendor.js` y el verificador.
  `curso-generar.py` escribe también la ruta local, así que un curso nuevo no
  vuelve a traer el CDN. Los verificadores ya no interceptan chess.js (ni
  `cdnjs.cloudflare.com` ni `**/chess.min.js`): esas rutas quedaron sin efecto
  con la mudanza y se quitaron, junto con la copia de `node_modules` que
  servían. Un verificador nuevo no necesita hacer nada: el sitio servido trae
  su chess.js.
- **jsDelivr sigue en el `script-src` de `_headers`, pero ya solo por la
  transcripción** de `reportes.html`, que importa `@huggingface/transformers`
  desde ahí (fijado a 3.3.3). Si algún día se quita esa función, jsDelivr se va
  de las dos directivas.
- **`js/supabase-client.js` no pisa un `window.sb` que ya exista.** Dos clientes
  en la misma página son dos suscripciones de auth y dos juegos de canales de
  Realtime sobre la misma sesión: no falla, las cosas llegan dos veces. Y de
  paso los verificadores pueden poner el suyo con `addInitScript` sin depender
  —como hasta ahora— de que esa línea **reventara** por no encontrar la
  librería. Eso último no es un detalle: media docena de verificadores pasaban
  gracias a ese accidente, y al traer la librería al repositorio se cayeron
  todos a la vez. `verificar-planes.js` necesitó además su doble en
  `pruebaResumen`, que abría la página a pelo: con el cliente funcionando de
  verdad, `planes.html` hace lo que tiene que hacer —mandar al login sin
  sesión— y se lleva `PlanClase` con ella.

**Al agregar una página que use el cliente o chess.js, o al actualizar una
librería, correr `node herramientas/verificar-vendor.js`** (no necesita navegador, ni red, ni el
sitio servido). Comprueba que ninguna página la pida a un CDN, que la ruta
relativa de cada una **llegue de verdad al archivo** —`js/vendor/…` escrito
desde `entreno/`, que está un piso abajo, da un 404 que tampoco avisa: la
página se queda en «Comprobando tu sesión…» para siempre—, que toda página que
use `js/supabase-client.js` cargue antes la librería, y que el archivo siga
siendo el de npm sin editar a mano.

## Lo pesado se baja cuando se usa, no al entrar

La portada pesaba **7,9 MB** y tardaba 16 segundos en terminar de cargar con red
de celular. No era el diseño ni el CSS: eran tres archivos del bot que se
bajaban al abrir la página, jugara alguien o no.

- `js/oscar-book.js` traía el libro de aperturas **escrito adentro**: 2,9 MB con
  las 94.106 posiciones de las ~32.400 partidas de Oscar.
- `tablero-board.js` pedía al cargar la **procedencia** de cada jugada
  (`data/oscar-book-provenance.json`, 4,2 MB) — y en `index.html` el panel que
  la muestra **ni existe**: se bajaba entera para tirarla a la basura.
- …y arrancaba el motor Stockfish (587 KB de WASM) con un `preload()`.

Quien entra a leer que hay clases en vivo y se va sin tocar una pieza —que es
la mayoría— se descargaba los tres. Ahora:

- **El libro vive en `data/oscar-book.json`** y lo baja `chess-bot.js` con
  `cargarLibro()`, memoizado, la primera vez que al bot le toca mover. En
  `js/oscar-book.js` solo quedó `OSCAR_ELO_CALIB` (medio kilobyte), que sí hace
  falta enseguida: es con lo que el bot sabe con qué Elo juega en "Difícil".
- **La procedencia se pide cuando el bot juega su primera jugada del libro**,
  que es el primer momento en que el panel tiene algo que decir, y **solo en las
  páginas que tienen el panel**.
- **El motor y el libro se precalientan al tocar el tablero**, no al cargar la
  página. Entre que alguien agarra una pieza y la suelta hay tiempo de sobra,
  así que para quien juega no cambia nada.
- Los scripts del tablero van con `defer`.

Resultado medido en un navegador de verdad, con 4G lenta y el procesador a un
cuarto: **7,9 MB → 0,21 MB**, y el `load` de 16,6 s a 1,6 s.

**Si la descarga del libro falla, no pasa nada, y es a propósito**:
`getBookMoveForHash()` ya devolvía `null` para una posición que el libro no
conoce, así que sin libro el bot juega con el motor — exactamente lo que hacía
antes en cualquier posición fuera del repertorio.

Y ahí está el peligro de todo esto: **nada de esto da error**. Si el libro no
llega, el bot no falla — deja de jugar como Oscar y nadie se entera. Si mañana
algo vuelve a pedir el libro al cargar, tampoco falla nada: la portada vuelve a
pesar 8 MB en silencio. Por eso:

**Al tocar el tablero, el bot o lo que carga, correr `node
herramientas/verificar-carga-tablero.js`** (con el sitio en localhost:8777,
playwright y `npm install chess.js@0.10.3`). Comprueba las dos mitades en un
navegador de verdad: que al CARGAR no se pida ninguno de los tres pesos
pesados y que la portada quepa en 1 MB; y que al JUGAR sí se pidan, que el
libro llegue **completo** (cuenta las posiciones contra el archivo, porque un
JSON truncado o un 404 tampoco darían error) y que el bot conteste.

- **`_headers` le pone un día de caché a los dos archivos de datos.** Cambian
  cuando se regeneran con partidas nuevas, o sea casi nunca, y sin eso quien
  juega un par de partidas se los vuelve a bajar en cada visita. Que queden un
  día viejos no rompe nada — ahí está la diferencia con el CSS, que si queda
  viejo deja la página sin la mitad de sus clases (por eso `sw.js` va a la red
  primero). Un libro viejo es un repertorio de hace unos días.
- **El service worker no los guarda** (`/data/oscar-book` está en `NUNCA`):
  serían 7 MB en el teléfono de quien probó el tablero una vez. Jugar sin red no
  es algo que el sitio prometa.
- `img/oscar-avatar-160.jpg` existe porque el de 480 px se mostraba en casillas
  de 40 y 80 px. El grande se sigue usando donde de verdad se ve grande
  (`sobre-oscar.html`, a 256 px).

## Lo que frena el primer pintado

«Lo pesado se baja cuando se usa» arregló la portada; esto es lo mismo en el
resto del sitio. Se midió **cada página** en un navegador de verdad, con 4G
lenta (1,6 Mbps, 150 ms) y el procesador a un cuarto, y casi todas tardaban lo
mismo en pintar el primer texto que en terminar de cargar: nada se ve hasta que
llegan y corren todos los scripts síncronos del `<head>`. Lo que había ahí:

- **pdf.js (368 KB) en la clase en vivo**, síncrono, para una función que se
  usa de vez en cuando (leer un PDF y sacarle los diagramas). Ahora lo pide
  `js/pdf-diagramas.js` la primera vez que el profesor elige un archivo; si
  falla, avisa «No se pudo cargar el lector de PDF.» y el siguiente intento lo
  vuelve a pedir.
- **Los bancos de ejercicios en el `<head>`**: `data/puzzle-rush-data.js`
  (355 KB, Racha táctica y Te reto), `js/arbitraje-items.js` (387 KB, los dos
  de arbitraje y `examenes.html`), `js/diagnostico-items.js` (189 KB). Los usa
  el script del final de cada página, así que van **justo antes de `main.js`**,
  en el mismo orden: siguen llegando antes de quien los usa, pero la página ya
  se pintó.
- **chess.js se pedía a cdnjs** en 43 archivos: otro origen, así que antes del
  primer byte el celular abre una conexión nueva (DNS, TCP y TLS, unos 600 ms
  en 4G), y casi siempre síncrono, con la página en blanco mientras tanto. Ya
  vive en `js/vendor/chess.js` (ver «La librería de Supabase tampoco viene de
  un CDN»), y las mediciones de abajo cuentan esa mudanza.
- **three.js (589 KB) en `inscripcion.html`**, síncrono en el `<head>`, para
  el fondo animado de piezas: el formulario quedaba en blanco hasta bajarlo.
  Ahora no va en ningún `<script src>`: `cargarFondo3D()` lo pide cuando la
  página ya terminó de cargar, y la animación arranca al llegar (si no llega, el
  formulario funciona igual). Con 4G lenta el formulario queda listo
  (`DOMContentLoaded`) a los 1,9 s en vez de 5 s. Como la ruta va escrita en el
  código y no en un `src="…"`, `verificar-vendor.js` la busca también entre
  comillas, y sigue comprobando que llegue al archivo.
- **La hoja de Google Fonts frenaba el pintado** de las 107 páginas: otro
  origen más. Va con `media="print"` y `onload="this.media='all'"`: se baja
  igual, pero el texto sale enseguida con la fuente del sistema y cambia a Inter
  al llegar (que es lo que `display=swap` ya prometía). Sin JavaScript se queda
  con la del sistema, y el sitio sin JavaScript no funciona de todos modos.
- `nivel-de-arbitraje.html` cargaba **`main.js` dos veces**: cada botón tenía
  dos manejadores y el menú del celular y el del modo oscuro se abrían y se
  cerraban en el mismo clic. `academias.html` cargaba dos veces
  `marca-academia.js` (ese se protege y no corría dos veces, pero se bajaba);
  `academia-cabecera.py` ya no lo suma si la página lo carga.

Primer pintado (FCP), mediana de 3 a 5 corridas, con el servidor comprimiendo
como Cloudflare y los orígenes de terceros simulados con 600 ms:

| Página | Antes | Después |
|---|---|---|
| `sesion.html` (clase en vivo) | 2,85 s | 1,94 s |
| `racha-tactica.html` | 1,91 s | 1,21 s |
| `te-reto.html` | 1,90 s | 1,28 s |
| `examenes.html` | 1,93 s | 1,48 s |
| `arbitraje.html` | 1,51 s | 1,23 s |
| `nivel-de-arbitraje.html` | 1,60 s | 1,32 s |
| `entreno/diagnostico.html` | 1,62 s | 1,44 s |
| `index.html` | 1,05 s | 0,88 s |
| `cursos.html` | 0,97 s | 0,65 s |
| un artículo | 0,96 s | 0,78 s |
| `tablero.html` | 1,01 s | 0,81 s |
| `bot.html` | 1,47 s | 1,58 s |

- **`bot.html` sale 0,1 s peor, y es la medición**: el archivo «de cdnjs» lo
  entrega Playwright sin pasar por la red simulada —ancho de banda gratis—,
  mientras que el local comparte los 1,6 Mbps con los otros 26 scripts de esa
  página. En un celular las dos descargas pasan por la misma radio, y la de
  cdnjs además paga la conexión.
- Quedaba Supabase, que se llevaba casi todo lo que faltaba en la Academia:
  ver la sección que sigue.

### Supabase va al final del `<body>`

`js/vendor/supabase.js` (213 KB, ~55 KB comprimido) iba síncrono en el
`<head>` de 69 páginas —toda la Academia, el login, Unirse—, y detrás de él
entre 2 y 25 scripts más: su cliente, lo que lo usa y los módulos del tablero.
Nada se pintaba hasta que llegaban y corrían todos. Ahora van **justo antes
del primer script del `<body>`**, en el mismo orden que tenían.

- **En el `<head>` se quedan solo los que cambian la pantalla al cargar**:
  `adaptive-mode.js` (pone la clase del Modo Adaptado), `temas-plataforma.js`
  y los tres del tablero que ponen colores y estilo de pieza. Sacarlos sería
  pintar primero con los colores de otra persona. Ninguno depende de lo que se
  movió. La guardia de sesión tampoco se movió: lee `localStorage`, no
  necesita la librería.
- **Todo lo que usa `sb` arranca cuando la página ya se leyó** (`async`, o
  `DOMContentLoaded`); se revisaron uno por uno. Y lo que está en el `<body>`
  lo encuentra igual, porque va antes que cualquier script del `<body>`.
- **Supabase tiene que seguir corriendo PRIMERO entre los movidos.** La primera
  versión movía solo Supabase y lo que lo usa, y dejaba el resto en el
  `<head>`: el primer pintado mejoró, pero el cliente quedaba listo **hasta
  medio segundo después** (`sesion.html`), porque ahora corría detrás de los
  motores y el tablero. O sea, se veía antes pero los datos llegaban después.
  Moviendo todo el bloque con su orden, las dos cosas mejoran.
- **Los tres módulos del tablero que no pintan** (`board-themes`,
  `chess-piece-svg`, `pieza-preferida`) los pone ahora `tablero-cabecera.py`
  en su propio bloque `<!-- tablero-js -->` del `<body>`, en todas las páginas
  con tablero. Si se movieran a mano, la próxima corrida del generador los
  devolvía al `<head>`.
- **Nunca dentro de un bloque generado**: un script insertado entre
  `<!-- x: inicio -->` y `<!-- x: fin -->` lo borra el generador de ese bloque
  la próxima vez que se corre, sin avisar. Pasó en la primera prueba de este
  cambio: Supabase desapareció de las páginas con tablero.

Se comprobó cargando las 84 páginas tocadas con una sesión de prueba, antes y
después, y comparando los errores de JavaScript: los mismos (y con el cliente
cargado antes que la librería, a propósito, la prueba sí salta). Primer
pintado y cliente listo (FCP / `window.sb`), misma red que arriba:

| Página | Primer pintado | Cliente listo | Fin de lectura |
|---|---|---|---|
| `sesion.html` | 1,95 → 0,77 s | 1,43 → 1,51 s | 2,16 → 2,08 s |
| `clases.html` | 1,10 → 0,74 s | 1,02 → 1,00 s | 1,40 → 1,28 s |
| `juegos.html` | 1,22 → 0,77 s | 1,11 → 1,16 s | 1,45 → 1,31 s |
| `torneo.html` | 1,34 → 0,68 s | 1,21 → 1,33 s | 1,68 → 1,52 s |
| `informes.html` | 1,30 → 0,78 s | 1,17 → 1,23 s | 1,44 → 1,36 s |
| `entreno/aprender.html` | 1,13 → 0,68 s | 1,02 → 1,34 s | 1,62 → 1,67 s |
| `racha-tactica.html` | 1,23 → 0,68 s | 1,11 → 1,52 s | 2,02 → 2,04 s |
| `login.html` | 1,06 → 0,71 s | 1,01 → 0,99 s | 1,39 → 1,28 s |

- **«Cliente listo» empeora en algunas, y no es lo que importa.** Antes la
  librería corría antes de leer el `<body>`, pero nadie pedía datos con ella
  hasta el script de la página, que está al final: ese arranca con el «fin de
  lectura» (`DOMContentLoaded`), que quedó igual o antes (lo peor, +0,05 s).
  Lo que se corrió es que ahora el navegador pinta antes de llegar ahí, y ese
  pintado ocupa el procesador.

### El código de las páginas sale del HTML

Las pantallas grandes traían todo su código escrito dentro, en un `<script>`
de la página: `sesion.html` 237 KB, `informes.html` 183, `clases.html` 131.
Eso tiene dos costos que no dan ningún error:

- **Se baja entero en cada visita.** Un archivo de `js/` el navegador lo guarda
  en caché y solo pregunta si cambió; el código escrito en el HTML viaja con
  la página, cada vez.
- **Obliga a dejar `'unsafe-inline'` en la CSP** (`_headers`), que es lo que
  deja correr cualquier `<script>` escrito en una página, incluido uno que
  alguien lograra colar. Sacarlo es la meta; para eso no puede quedar código
  escrito en ninguna página.

**Se muda tal cual, de a una página**: el bloque pasa a `js/<pagina>.js` byte
por byte (con una cabecera que dice de dónde salió) y en su lugar queda un
`<script src>` **en la misma posición**. Un script clásico externo corre en el
mismo orden que el escrito en la página y sus `let`/`const` de arriba siguen
siendo globales, así que no cambia nada de lo que hace. Antes de mudar uno se
revisa que no use `document.currentScript` ni tenga un `</script>` escrito, y
después se recompila el CSS (`npm run css`): **tiene que quedar idéntico**, porque
el compilador ya mira los `.js` de hasta 350 KB.

- **La mudanza la hace `herramientas/mudar-script.py <página> js/<destino>.js`**,
  siempre igual: toma el bloque más grande, se niega si usa
  `document.currentScript`, es `type="module"`, trae atributos o tiene un
  `</script` escrito adentro, copia el bloque byte por byte (sin reindentar: un
  template literal de varias líneas cambiaría de contenido), deja el
  `<script src>` en su lugar y comprueba que el archivo termine con el bloque
  original. Un `<!--` dentro de un string que arma HTML no es problema.
- **Los verificadores que leen el código de una página** tienen que leerlo con
  `herramientas/lib/codigo-de-pagina.js` (el `.html` más su código mudado), no
  con `readFileSync` del `.html`: al mudar `informes.html`,
  `verificar-admin.js` dejó de encontrar lo que buscaba y el CI salió en rojo.
  Uno escrito de otra forma habría pasado sin comprobar nada.
  Con las trece de gestión aparecieron los que no se encuentran buscando el
  nombre de la página: los que **barren todos los `.html`** buscando código
  (`alert`, «quien usa `Avisos` carga el módulo», las rutas a `js/vendor/`,
  los enlaces legales, los PDF de administración) o la tienen en una lista de
  excepciones (`EXCEPTUADOS` de `verificar-tablero-preferido.js`). Esos no
  fallan: dejan de mirar la página. Se pasaron a `codigo-de-pagina.js`, y cada
  uno se rompió a propósito en un `js/<pagina>.js` para ver que salta. Los que
  barren el `.html` buscando **marcado** (la pantalla de carga, el «?», las
  migas, el tema) se quedan como están. Con las de juegos, lo mismo en
  `verificar-reloj-y-repeticion.js` («el reloj no se calcula con la hora de la
  computadora») y `verificar-ritmos.js` («no tiene su propia lista de
  ritmos»): una comprobación de que algo NO está es la primera que pasa sin
  mirar.
- `codigo-de-pagina.js` reconoce el código de una página por la **primera
  línea** del archivo (`/* El código de <pagina>.`): mirando toda la cabecera
  se llevaba `js/precios-acceso.js` como código de `precios.html`, porque la
  nombra, y `verificar-accesos.js` le encontraba los «₡» del módulo.
- `sesion.html` fue la primera: de 330 KB a 91 KB de HTML, y `js/sesion.js`.
  `informes.html`, de 227 KB a 42 KB, y `js/informes.js`. `clases.html`, de
  178 KB a 38 KB, y `js/clases.js`. `admin.html`, de 134 KB a 35 KB, y
  `js/admin.js`. Después, en grupo, las trece de gestión (cobros, formularios,
  configuración, academias, jugadores, coordinación, exámenes, asistencia,
  accesos, tareas, reportes, planes e inscripción), cada una a su
  `js/<pagina>.js`. `inscripcion.html` tiene su propio CSS
  (`tailwind-inscripcion.css`), que `css-construir.js` arma mirando solo esa
  página: su código mudado tuvo que entrar a esa lista (`INSCRIPCION`), o las
  clases que pone el script se habrían quedado sin estilo sin que nada avisara.
  Luego las diez de juegos (juegos, bot, tv, torneo, arbitraje, variante,
  partidas, niebla, lector de planillas y cuatro jugadores). Y por último las
  ocho de `entreno/`, que van a `js/entreno-<pagina>.js` (la página las carga
  con `../js/`). Con eso no queda ninguna página con un bloque de más de 20 KB.
  Después el límite bajó a **2 KB** (34 páginas más, 432 KB): primero las 18
  de juegos y ejercicios (te-reto, visualización, crazyhouse, cartas,
  coordenadas, estándar, nivel de arbitraje, Sonar, concentración, duelo,
  examen, racha táctica, precisión posicional, Confites, ilumina, torneos,
  Estudio y logros —esta a `js/logros-pagina.js`, porque `js/logros.js` es
  el módulo compartido—). Y después las 16 de gestión y páginas públicas
  (tienda, subgrupos, inscripciones, supervisión, tablero de academias,
  solicitudes, formulario, bienvenida, informe mensual, novedades, precios,
  elegir plan, campeones, cursos, login e inscripción). `inscripcion.html`
  tenía dos bloques: el fondo 3D va a `js/inscripcion-fondo.js` y el cliente
  de su base a `js/inscripcion-datos.js`, y los dos entraron a `INSCRIPCION`
  de `css-construir.js`. Con eso no queda ninguna página con un bloque de más
  de 2 KB escrito adentro.
- `mudar-script.py` y `verificar-carga-paginas.js` recorren el HTML en orden
  para encontrar los bloques: un `<script` escrito dentro de un comentario
  HTML no es un bloque. `inscripcion.html` tiene uno («ni en un
  `<script src>`»), y con la regex suelta la mudanza habría empezado en medio
  del comentario.
- `verificar-carga-paginas.js` lleva la lista `PENDIENTES` de las que todavía
  traen un bloque de más de 2 KB (el límite empezó en 20): **ya está vacía**. La
  lista solo se achica, así que una página nueva con un bloque grande falla:
  su código va a `js/` desde el primer día.
- Quedan para después las piezas chicas que ponen los generadores en el
  `<head>` (la guardia de sesión, el tema, el modo oscuro) y el `onload` de la
  hoja de fuentes: son lo último antes de poder sacar `'unsafe-inline'`.

### Sin sesión, al login antes de bajar nada

Cada página de la Academia decide que no hay sesión en su propio script, **al
final**, después de bajar todo lo demás. Sin sesión, `sesion.html` bajaba
773 KB, `entreno/mates.html` 647 KB y `juegos.html` 509 KB solo para mandar al
login, y `juegos.html`, `torneos.html`, `clases.html` y otras ni siquiera
volvían: `login.html` sin `next`.

- **La guardia de sesión** (la pone `academia-cabecera.py`, justo después de
  `<meta charset>`) mira si hay una sesión guardada (`sb-<proyecto>-auth-token`,
  la clave de supabase-js; el proyecto se lee de `js/supabase-client.js`) y si
  no hay **ninguna**, detiene la carga y manda a `login.html?next=<la página>`.
- **`window.stop()` va ANTES de `location.replace()`**, y el orden importa. El
  navegador ya lanzó por adelantado los scripts del `<head>` (el *preload
  scanner*) antes de que la guardia corra: sin cortarlos, igual se bajaban 150 a
  200 KB. Al revés —navegar y después `stop()`— cancelaría la propia navegación
  al login. Medido desde la página original: de 390 a 773 KB a **10 KB** en la
  mayoría (hasta 107 KB si la hoja de estilos alcanza a llegar).
- **Solo decide lo seguro.** Con una sesión guardada, aunque esté vencida, no
  hace nada: la renueva o la rechaza el flujo de siempre. Si `localStorage`
  falla, tampoco. Si ya hay un `window.sb` (el doble que ponen los
  verificadores antes de cargar la página), se aparta.
- **`cobros.html` va sin guardia** (`SIN_GUARDIA`): sin sesión enseña su propia
  tarjeta de «Iniciar sesión», a propósito.
- `node herramientas/verificar-guardia-sesion.js` (sin navegador) comprueba que
  cada página de `PAGINAS` la lleve una vez, en su lugar, con la clave del
  proyecto, su propio `next` y una ruta al login que llegue.

**Al agregar un script o una página, correr
`node herramientas/verificar-carga-paginas.js`** (sin navegador): que ningún
script de más de 150 KB vaya síncrono en el `<head>` (tampoco Supabase), que
ninguna página cargue dos veces el mismo script y que la hoja de fuentes no
frene el pintado. `verificar-vendor.js` vigila además que nadie vuelva a pedir
chess.js a un CDN.

## Metadatos: que el enlace se vea y la página se encuentre

Cada página pública lleva su descripción, su `canonical` y su bloque de Open
Graph, todo junto debajo del `<title>`. **Lo del Open Graph no es un detalle
acá**: el botón principal del sitio manda a WhatsApp, o sea que WhatsApp es por
donde se comparte esto, y sin `og:image` el enlace sale pelado.

- `img/og-ajedrez-integral.jpg` (1200×630) es la imagen que se ve al compartir.
  **No se edita a mano**: la genera `herramientas/og-imagen.js` con los colores
  de la paleta, así que si cambian se vuelve a correr (`node
  herramientas/og-imagen.js`, con playwright). Va en JPEG y no en PNG porque es
  un degradado: el mismo dibujo pesa 490 KB en PNG y 91 en JPEG, y WhatsApp
  descarta las previsualizaciones pesadas.
- `img/redes/` tiene las imágenes de las redes: la portada de Facebook
  (`portada-facebook.png`, 1640×624) y la publicación de Instagram
  (`instagram.png`, 1080×1350, 4:5). **Tampoco se editan a mano**: las genera
  `herramientas/imagenes-redes.js`, con la misma paleta y el logo, y el diseño
  común está una sola vez. Cada red recorta lo que se sube —Facebook, en el
  celular, deja solo el centro 16:9 de la portada; Instagram, en la cuadrícula
  del perfil, el centro 3:4 de la publicación—, así que el script **falla si
  algo del contenido se sale de la franja que siempre se ve**. En Facebook,
  además, la foto de perfil de la página tapa el centro de la mitad de abajo en
  el celular (la primera versión de la portada tenía ahí el lema y la
  dirección, y quedaban tapados): esa zona, medida en una captura real, va en
  `tapado` y el script falla si un texto cae debajo. Por eso el nombre, el lema
  y la dirección van arriba, y abajo solo hay textos cortos a los costados. Van en PNG porque
  las dos recomprimen lo que se sube y un JPEG recomprimido ensucia las letras.
  No las pide ninguna página, así que `img/redes/` está en `.assetsignore`.
- **Las páginas que piden sesión llevan `noindex`** y no llevan `canonical`: no
  tiene sentido indexar una pantalla de acceso, y así no compiten con las
  públicas. Lo mismo `cursos/academia/`, que es el espejo del catálogo dentro de
  la Academia — si se indexara, competiría con `cursos/` por el mismo contenido.
- El `canonical` apunta a la dirección **con `.html`**, que es la que usan todos
  los enlaces internos. Cloudflare sirve además `/cursos` con el mismo
  contenido; el canonical le dice a Google cuál de las dos vale, sin tocar el
  enrutamiento.
- `sitemap.xml` **no se escribe a mano**: lo arma `herramientas/sitemap.py`
  leyendo qué páginas NO tienen `noindex`. Si una página se abre o se cierra,
  se vuelve a correr y el sitemap se entera solo.
  - **Los que barren `**/*.html` tienen que saltarse `node_modules/`.**
    `sitemap.py` y `verificar-metadatos.py` no lo hacían, y como `node_modules`
    está en `.gitignore` la falla solo aparece en la máquina de quien siguió las
    instrucciones de este mismo archivo y corrió `npm install`: el sitemap salía
    ofreciéndole a Google media docena de páginas internas de playwright, y no
    daba ningún error — quedaban escritas en el archivo y ya. `pwa-cabecera.py`
    y `verificar-voseo.py` ya lo hacían; ahora lo hacen los cuatro.
  - **Las dos listas de páginas exceptuadas de la app tienen que decir lo
    mismo.** `verificar-pwa.js` exceptuaba `libro-de-diagnostico-accesible.html`
    y `pwa-cabecera.py` no, así que el generador le ponía el `manifest` en cada
    corrida y el verificador no se quejaba nunca. Es un documento que se abre
    suelto, hasta por correo y sin red: declarar un `manifest` que no va a poder
    cargar es peor que no declararlo.
- Los datos estructurados (JSON-LD) los genera
  `herramientas/datos-estructurados.py` desde el propio HTML —título,
  descripción, fecha impresa del artículo, lista de cursos de la portada—, así
  que no se pueden desincronizar del contenido. Falta a propósito `offers` y
  `hasCourseInstance` en cada curso (precio, duración, modalidad): sin esos
  datos Google no muestra la ficha enriquecida, y se prefiere el marcado a
  medias antes que inventar números.
- **Todo esto se comprueba de una corrida**, sin instalar nada:
  `python3 herramientas/verificar-metadatos.py` (unos 330 chequeos). **Al tocar
  metadatos, correrlo**, y volver a generar sitemap y datos estructurados.
- Las fuentes: solo se piden los pesos que el sitio usa. Inter en 400, 500, 600
  y 700; **Merriweather solo en 700**, porque `font-serif` aparece 963 veces y
  siempre con `font-bold`, ni una sin peso. Antes se bajaban nueve archivos de
  fuente y se usaban cinco.
- `js/adaptive-mode.js` **sigue sin `defer` a propósito**: aplica la clase
  `adaptive-mode` en el `<html>` al ejecutarse, igual que el script del tema que
  está justo arriba. Con `defer` correría después de parsear el HTML y quien
  tiene el modo adaptado encendido vería un parpadeo con la página sin adaptar.

## El encabezado ocupa su propio espacio

El encabezado del sitio es `sticky top-0`, **no `fixed`**, y esa es la razón por
la que ninguna página tiene que compensar su altura a mano. Antes era `fixed` y
cada página descontaba esa altura por su cuenta: `pt-16 md:pt-20` en el `<main>`,
un `<div class="hidden lg:block h-8">` suelto, `pt-28` en los artículos, `pt-32`
en las pantallas de carga, `pt-20 min-h-screen` en las de acceso. Seis maneras
distintas de escribir el mismo número.

El problema es que la altura real cambia de cuatro formas —en `md`, en `lg`
cuando aparece la barra de arriba, al hacer scroll (`#header.scrolled` la baja a
3.5rem) y en modo adaptado, que sube la tipografía a 112%—, y ninguno de esos
números escritos a mano se entera. Con `sticky` el encabezado está en el flujo:
ocupa su espacio solo, se pega al hacer scroll y no hay nada que descontar.

- **Regla: si te encontrás compensando a mano una altura que el navegador ya
  sabe calcular, es que hay que dejarlo calcular.**
- `html { scroll-padding-top }` en `css/styles.css` es lo que hace que saltar a
  un ancla no deje el destino debajo de la barra — incluye el propio "Saltar al
  contenido principal". Sin eso, `scroll-behavior: smooth` lleva el destino
  exactamente a donde la barra lo tapa.
- Las alturas del encabezado son `min-h-*`, nunca `h-*`: con altura fija, en
  modo adaptado el contenido se sale de la caja en vez de empujarla.
- Lo que quiere ocupar la pantalla entera resta la barra en vez de sumarle
  padding: `min-h-[calc(100vh-5rem)]`, no `pt-20 min-h-screen` (que daba una
  página más alta que la pantalla).

## Dentro de la Academia no hay encabezado de marketing

Decisión: quien ya inició sesión no vuelve a ver el encabezado ni el pie del
sitio público. Hasta este cambio los compartían las 76 páginas del sitio por
igual — la portada, un artículo, **y también** el panel de Clases, un
ejercicio de Entrenamiento o la partida en vivo con el profesor: Inicio,
Cursos, Artículos, Jugar contra el profe, el botón "💬 Inscríbete" (que invita
a inscribirse a quien ya está inscrito) y la barra de arriba con "🏆 ¡Te
reto!" y "TV en vivo". Nada de eso rompía nada — es exactamente la clase de
falla que no truena: un alumno resolviendo un ejercicio o mirando su registro
de clases tenía ahí arriba seis destinos que no tienen nada que ver con lo
que estaba haciendo, y de ahí a irse por donde no corresponde hay un clic.

- **El criterio es "exige sesión", no la carpeta ni el nombre.** Una página
  cae en esto si redirige a `login.html` sin sesión (`location.href =
  "login.html"`) o si la pide con `requireLoginThenGate()`. Por eso
  `entreno/diagnostico.html` y `nivel-de-arbitraje.html` **quedan afuera** a
  propósito: se pueden hacer sin cuenta, están pensadas para llegar desde un
  buscador, y ahí el encabezado público —con su enlace a "Cursos" y su
  "Inscríbete"— es lo que corresponde mostrarle a quien todavía no es alumno.
  `cobros.html` **sí** entra aunque no redirija (muestra un aviso de "inicia
  sesión" en vez de mandar a otra página): es una página que solo tiene
  sentido con cuenta, igual que el resto.
- **Aplica a todo el mundo con sesión, profesor y administración incluidos.**
  No es una regla solo para alumnos: dentro de la Academia nadie necesita el
  menú de marketing, y tenerlo iba a la deriva por página según quién la
  escribió — algunas ya traían un encabezado reducido a mano (`entreno/*` sin
  "Cursos" ni la barra de arriba), otras el completo. Ahora es una sola forma.
- **El encabezado queda en dos elementos: el logo y el interruptor de
  tema.** El logo lleva de vuelta a `clases.html` (el panel, no `index.html`)
  — es la puerta de salida de cualquier página de la Academia, con un
  `sr-only` ("— panel de la Academia") para quien no lo intuye por el nombre.
  Sin menú no hace falta el botón de hamburguesa ni el `#mobile-menu`:
  `js/main.js` ya los busca con `if (menuToggle && mobileMenu)` antes de
  engancharlos, así que su ausencia no rompe nada.
- **El pie queda en una sola línea** (`&copy; 2026 Ajedrez Integral…`), la
  misma que ya traían de antes los `entreno/*` y algunas páginas de
  `cursos/academia/`: se pareja el resto en vez de inventar una tercera
  forma.
- **`herramientas/academia-cabecera.py`** hace el cambio y se puede correr
  todas las veces que se quiera: reemplaza el único
  `<header id="header">…</header>` y el único `<footer>…</footer>` de cada
  página de su lista, así que una corrida encima de otra da lo mismo. **Al
  agregar una página nueva que exige sesión, sumarla a la lista `PAGINAS` del
  script y correrlo** — copiar el encabezado de otra página de la Academia a
  mano es exactamente como esas 76 páginas terminaron todas con el mismo
  encabezado de marketing.
- Las páginas públicas (`index.html`, `cursos.html`, `cursos/<curso>.html`,
  `tv.html`, `te-reto.html`, `bot.html`, `tablero.html`, los dos
  diagnósticos públicos, etc.) **no se tocan**: siguen con el encabezado y el
  pie completos, porque ahí sí hace falta poder llegar a cualquier parte del
  sitio y la invitación a inscribirse tiene sentido.

### Las migas de pan: el camino de vuelta, igual en todas

Debajo del encabezado de la Academia va una franja con el camino: «🏛️
Academia › Juegos › Niebla de Guerra». Antes cada página se escribía su propio
enlace para volver, y había de todo: «← 🏛️ Academia», «Volver al panel»,
«← Panel», «← Volver al panel de Clases», un botón en `sesion.html`, dos enlaces
sueltos en la barra de cada ejercicio de Entrenamiento… y varias páginas sin
ninguno. El único camino de salida seguro era saber que el logo lleva al panel.

- **Las pone `herramientas/academia-cabecera.py`**, con la misma lista
  `PAGINAS`: una página nueva de la Academia las recibe al correr el script.
  `NOMBRE_Y_PADRE` dice cómo se llama cada página y **de cuál cuelga**. El
  camino se arma subiendo hasta `clases.html`, que es la raíz y no lleva migas.
  El padre es desde donde se llega de verdad (Niebla cuelga de Juegos, el
  examen de Exámenes, Actualizaciones de Administración), no la carpeta. Una
  página de `PAGINAS` que no esté en `NOMBRE_Y_PADRE` **hace fallar el
  script**, para que nadie la agregue sin decir de dónde cuelga. Los cursos de
  `cursos/academia/` no hace falta anotarlos: su nombre sale del `<title>`.
- **Van FUERA del encabezado, no adentro.** El encabezado es `sticky`: cada
  renglón que se le suma se come pantalla en todas las páginas con tablero. La
  franja se va con el scroll como cualquier otro contenido. Se alinea con el
  logo (el `max-w-7xl` del encabezado), no con el contenido de cada página,
  que tiene anchos distintos.
- **Se quitaron los «←» sueltos que llevaban al mismo lugar.** Un destino no
  va dos veces. Se quedaron los botones de los estados de error y de acceso
  denegado («← Volver a la Academia» debajo de «Esta página no es para tu
  cuenta»): ahí el botón ES lo que se le ofrece a quien no puede seguir. También
  se quedaron los «volver» de adentro de una herramienta («← Todos los
  niveles», «← Todas las lecciones»), que no salen de la página.
- **El «← Mis cursos · Panel de Academia» de los cursos salía de un
  generador** (`herramientas/curso-generar-formacion.py`): se quitó de ahí
  también, o volvía al regenerar.
- **Dos páginas tocan sus migas desde su propio código**, y ninguna más debería:
  - `sesion.html`: salir de la clase por las migas o por el logo cierra antes
    el registro de asistencia del alumno (`stopPresenceLog()`), igual que lo
    hacía su botón «← Academia». Si no, el registro diría que el alumno siguió
    en la clase hasta que se venció la conexión.
  - `subgrupos.html`: cuando quien coordina abre los subgrupos de un profesor,
    le agrega el paso «Coordinación», que es de donde vino.
- Los enlaces van **subrayados** (el color no va solo) y el paso actual va con
  `aria-current="page"`, sin enlace. El `<nav>` se llama «Estás en».
- Lo comprueba `herramientas/verificar-avisos.js`: todas las páginas con el
  encabezado de la Academia tienen un solo bloque de migas justo debajo del
  encabezado, cada paso existe, el primero es el panel, y en la pantalla se ven,
  no desbordan a 360 px y pasan AA en claro y en oscuro.

### El «?» de la guía, solo para administración

Al lado del botón de tema, las páginas de la Academia que la guía del profesor
explica llevan un «?». Lleva al capítulo de la guía que habla de esa página:
Informes al capítulo «Informes», Niebla al capítulo «Jugar», un curso al
capítulo «Los cursos de la Academia».

- **Por ahora es solo de administración**, igual que la tarjeta «📘 Guía del
  profesor» del panel (solo en `ADMIN_GROUPS`). Lo decidió el dueño del sitio: la guía
  todavía no se le ofrece al equipo docente. El enlace llega en el HTML
  **escondido** (clase `hidden`), y `js/ayuda-guia.js` lo destapa solo si
  quien mira administra y está en su propia vista. Mirando «como estudiante» o
  «como profesor» (`js/modo-vista.js`) no aparece, porque ese rol no lo tiene.
  El día que la guía sea del equipo docente, se cambia la condición de ese
  archivo y la de la tarjeta, las dos juntas.
- La guía no se protege con esto: es una página pública. Lo que se decide es a
  quién se le **ofrece**.
- **El capítulo va por su `id`** de `herramientas/guia/contenido.json`
  (`AYUDA_GUIA` en `academia-cabecera.py`), no por su número. El número del
  ancla (`#cap-N`) se calcula al generar, con el mismo orden con que
  `guia-profesores.js` escribe las anclas. Reordenar la guía no deja un «?»
  apuntando al capítulo de al lado, y un `id` que no existe hace fallar el
  script.
- **Solo llevan «?» las páginas que la guía de verdad explica.** Un «?» que
  lleva a un capítulo que no habla de la página es peor que no tenerlo: quien
  lo abre lee el capítulo entero buscando algo que no está. Por eso, antes de
  sumar una página a `AYUDA_GUIA`, se le escribe su apartado. Así entraron
  después la asistencia presencial y el horario (en «La clase en vivo»), los
  subgrupos (en «Tareas»), los cupos de acceso (en «Administración») y un
  capítulo nuevo, «Supervisión y academias», con el informe mensual,
  supervisión, academias y el tablero por academia. Cada apartado se escribió
  leyendo la página y su decisión, no de memoria. Siguen sin «?» Novedades, la
  tienda (todavía cerrada), Sonar y la vista de jugador de administración.
  `verificar-ayuda.js` comprueba que cada una de esas siete páginas lleve a SU
  capítulo.
- Se abre en otra pestaña, para no perder lo que se estaba haciendo, y el
  nombre accesible lo dice: «Ayuda: capítulo «Informes» de la guía del
  profesor (se abre en otra pestaña)».
- Lo comprueba `herramientas/verificar-ayuda.js`:
  - que cada ancla exista en la guía y sea el capítulo que dice su nombre;
  - que llegue escondido;
  - que lo vea administración y no un profesor, ni administración mirando
    «como estudiante»;
  - el contraste contra el encabezado.

### Ctrl + K en toda la Academia

En cualquier página de la Academia, **Ctrl + K** (⌘ + K en Mac) lleva al
buscador del panel (`clases.html?buscar=…`), que encuentra tarjetas y
personas. Si había texto seleccionado, llega ya buscándolo: seleccionar «María
Rojas» en una lista y apretar Ctrl + K la busca.

- Lo pone `herramientas/academia-cabecera.py` (`js/atajo-buscar.js`, con
  `data-arriba` para volver a la raíz desde `entreno/` o `cursos/academia/`).
- **No va en tres páginas, a propósito**:
  - `clases.html` tiene su propio atajo, que lleva al campo sin recargar;
  - `sesion.html`, porque salir de la clase en vivo tiene que cerrar antes la
    asistencia del alumno (lo hacen sus migas y su logo), y un atajo que cambia
    de página por su cuenta se la saltaría;
  - `examen.html`, porque salir del examen cuenta como salida y lo congela.
- Solo Ctrl + K, no «/»: fuera del panel hay tableros, ejercicios y cuadros de
  comandos donde «/» es parte de lo que se escribe.
- Lo comprueba `herramientas/verificar-atajo.js`:
  - que las 65 páginas lo carguen con su ruta y las tres de la excepción no;
  - que Ctrl + K y ⌘ + K lleven al panel con lo seleccionado;
  - que una «k» sola no haga nada;
  - que desde `entreno/` suba bien.

## Los avisos son de la página, no del navegador

`alert()`, `confirm()` y `prompt()` quedaron **prohibidos en todo el sitio**. En
su lugar va `js/avisos.js`:

| Antes | Ahora | Para qué |
|---|---|---|
| `alert("Listo")` | `Avisos.avisar(texto)` | Un mensaje arriba que se va solo a los 6 s |
| `alert("No se pudo…")` | `Avisos.avisar(texto, { tipo: "error" })` | No se va solo: se cierra con ✕ |
| `alert()` que hay que leer sí o sí | `await Avisos.alerta(texto, { titulo })` | El aviso de salida de un examen, el usuario de una cuenta nueva |
| `if (!confirm(…)) return` | `if (!(await Avisos.confirmar(texto, { titulo, aceptar, peligro }))) return` | La función tiene que ser `async` |
| `prompt()` | `await Avisos.pedir(texto, { etiqueta, valor })` | Devuelve `null` si se cancela, como `prompt()` |
| varios `prompt()` seguidos | `await Avisos.formulario({ titulo, campos })` | El pago de un cobro: monto, método (una lista, ya no se escribe) y comprobante |

Por qué se cambió: había más de cien en veinte páginas. No seguían el modo
oscuro ni el tema, congelaban la página entera (con el reloj de una partida
adentro), en el celular parecían un error del sistema, el botón decía siempre
«Aceptar» y no dejaban ofrecer «Deshacer».

- **El botón dice lo que va a pasar** («Eliminar», «Rendirme», «Mandar
  ahora»), nunca «Aceptar». Así se entiende sin leer la pregunta. La pregunta
  va en `titulo` y la consecuencia en el texto.
- **Con `peligro: true`** el botón va en rojo y **el foco arranca en
  «Cancelar»**: un Enter apurado no borra nada. Escape siempre cancela, y al
  cerrar el foco vuelve al botón que abrió el diálogo.
- **De a un diálogo por vez**: si se piden dos seguidos, el segundo espera.
- **Con un diálogo abierto, los mensajes van adentro de él.** Un diálogo modal
  deja inerte todo lo de afuera: un mensaje que saliera en la página se veía
  detrás, oscurecido, y su «Deshacer» no se podía tocar. Ahora la zona de
  mensajes se muda al diálogo modal que esté abierto (también los que ya
  estaban a la vista cuando se abre), y al cerrarse vuelven a la página con su
  tiempo y su botón intactos.
- **Un mensaje de error no se va solo.** Un error que desaparece mientras uno lo
  lee es un error que no se leyó. Los de «listo» sí se van, y mientras el mouse
  o el foco están encima no se van: nadie tiene que alcanzar «Deshacer» contra
  el reloj.
- **«Deshacer» en vez de preguntar, solo donde deshacer es de verdad
  devolver la fila.** Hoy son dos: borrar un PGN propio en Archivos (se
  borra, y «Deshacer» lo vuelve a insertar igual: mismo id, carpeta y fecha) y
  quitar un encargado que uno mismo apuntó en Informes (vuelve con su id,
  frecuencia, hora, día y último envío, así el próximo informe sale cuando
  tocaba). De esas filas no cuelga nada, y quitar un encargado no manda correo. Donde algo cuelga en cascada (una tarea y sus
  renglones, un examen y sus respuestas) o hay un correo que ya salió, se sigue
  preguntando antes: reinsertar la fila no devolvería lo que se borró con ella
  ni desmandaría el correo. Cualquier otro «Deshacer» nuevo tiene que pasar la
  misma prueba antes de reemplazar una confirmación. El PGN de OTRO profesor (lo que borra
  quien administra) y el encargado que apuntó otra persona también se
  preguntan: sus políticas de insert exigen `profesor_id = auth.uid()` y
  `creado_por = auth.uid()`, y no se podrían devolver tal cual.
  `verificar-informes.js` comprueba las dos ramas.
- **Una sola forma de avisar.** Ocho páginas (academias, accesos, asistencia,
  cobros, coordinación, informe mensual, subgrupos y supervisión) tenían su
  franja `#aviso` propia, arriba del contenido: quien había bajado a una fila
  del final apretaba «Guardar» y el «listo» o el error salían donde no los
  veía, cada página con sus colores y su tiempo (cobros la escondía a los 6
  segundos, las demás nunca). Ahora su `avisar(texto, malo)` llama a
  `Avisos.avisar` y la franja no existe. Se quedan dos, que no son mensajes
  sino el estado de la página: la de `tablero-academias.html` y la de
  `novedades.html` dicen que la página no se pudo cargar y ocupan el lugar del
  contenido. Tampoco son esto las regiones `#aviso` de Sonar y de Confites:
  narran la partida. Los verificadores leen los mensajes con
  `mensajesVisibles(page)` de `herramientas/lib/avisos-prueba.js`, que mide
  con `checkVisibility()`.
- Se carga con `<script src="js/avisos.js"></script>` en el `<head>`, **sin
  `defer`**: los scripts de cada página van al final del `<body>` sin `defer`
  y corren ANTES que uno diferido, así que un aviso pedido mientras la página
  arranca encontraría `Avisos` sin definir.
- **Los verificadores contestan los diálogos apretando sus botones**, con
  `herramientas/lib/avisos-prueba.js` (`contestarAvisos` como init script o
  dentro del cliente falso). Lo que la página mostró queda en
  `window.__avisos`, y lo que hay que escribir se prepara en
  `window.__respuestas`. Ya no sirve `page.on("dialog")` ni pisar
  `window.confirm`.
- `herramientas/verificar-avisos.js` barre **todo** el sitio buscando un
  `alert(`/`confirm(`/`prompt(` nuevo (sin contar comentarios), revisa que toda
  página que llama a `Avisos` cargue el archivo, y prueba en el navegador el
  comportamiento de arriba con el contraste medido.

## Las pantallas de carga y las listas vacías

**Toda pantalla de carga (`#loading`) tiene la misma forma**:

```html
<div id="loading" role="status" class="min-h-[50vh] flex flex-col items-center justify-center gap-3 …">
  <span aria-hidden="true" class="… animate-spin motion-reduce:animate-none"></span>
  <p class="text-sm">Cargando…</p>
</div>
```

Había cinco formas escritas a mano (`pt-16`, `py-20`, `py-24`,
`min-h-[calc(100vh-5rem)]`, con y sin `<p>`), y en 45 páginas. Una página nueva
se copiaba de cualquiera.

- `role="status"`: el lector de pantalla dice que está cargando. La ruedita va
  con `aria-hidden`, porque es adorno, y se queda **quieta** para quien pidió
  menos movimiento (`motion-reduce:animate-none`).
- El texto va en su `<p>` y cada página conserva el suyo («Comprobando tu
  sesión…», «Cargando tu panel…»). Cuando algo falla, la página escribe el
  error con `loading.textContent = …`. Eso reemplaza también la ruedita, y está
  bien: un error no tiene que seguir girando.
- `clases.html` la lleva en `#loading-spinner`, porque su `#loading` también
  contiene la pantalla de error.

**Las listas vacías de trabajo dicen qué hacer**, nombrando el botón tal como
se llama en la pantalla, entre comillas latinas. Un «Todavía no hay nada» a
secas deja a la persona delante de una caja vacía sin saber si está rota. Por
ejemplo: «Todavía no le has mandado ninguna tarea a nadie. Arma la primera
arriba, en «Asignar una tarea».» Las demás ya lo hacían (Cobros, los encargados
de Informes, Juegos, Torneos).

Lo comprueba `herramientas/verificar-estados.js`:

- que las 45 pantallas de carga tengan la forma compartida;
- que las listas vacías de tareas, exámenes, planes, horario y archivos nombren
  su botón, y que ese botón exista;
- en la pantalla, que la ruedita gire, que con «reducir movimiento» se quede
  quieta y que el texto tenga contraste AA en claro y en oscuro.

Al agregar una pantalla de carga, se copia la de arriba. Al agregar una lista
vacía de trabajo, se escribe su paso siguiente y se suma a `VACIAS` del
verificador.

## El punto de restauración: la base no vivía en ninguna parte

`RESTAURAR.md` es el documento operativo —qué hacer si algo falla— y esto es
por qué existe. El sitio siempre estuvo respaldado: es un repositorio de git,
se vuelve atrás con una etiqueta. Lo que no estaba respaldado era **todo lo
demás**, y no daba ningún error porque la plataforma funcionaba igual.

- **Las 179 migraciones de la Academia vivían SOLO en Supabase.** Ahí están las
  62 tablas, las 110 funciones, las 176 políticas de RLS y los 20 triggers: o
  sea, quién ve a quién, quién puede escribir qué y todas las decisiones que
  este archivo explica. Si ese proyecto se perdiera o alguien borrara de más,
  no había de dónde reconstruirlo. Ahora están en `supabase/migraciones/`
  (y las 5 del proyecto de inscripciones en `supabase/migraciones-colegios/`),
  bajadas de `supabase_migrations.schema_migrations` **y comprobadas una por
  una con su md5**: una migración transcrita a medias se ve igual de bien que
  una entera, y la diferencia solo aparece el día que hay que restaurar.
- **Cinco Edge Functions estaban desplegadas y no estaban en el repositorio**:
  `notificar` (el VAPID y el cifrado `aes128gcm` escritos a mano, o sea lo más
  difícil de rehacer de todo el sitio), `chess-results-proxy`, `ocr-scoresheet`,
  `enviar-resultado-arbitraje` y `bootstrap-admin`. Es el mismo agujero que ya
  se había tapado de a una con `cobros-recordatorios`, `informes-encargados` y
  `admin-manage-users`; ahora están las 14.
- **El retrato del esquema** (`supabase/esquema/`) no restaura nada: sirve para
  comprobar, DESPUÉS de restaurar, que no falte ninguna política ni ningún
  trigger. Un esquema al que le falta una política se ve perfecto y deja
  abierto —o cerrado— algo que no era.

### Lo que sigue sin red, y es lo caro

**Los datos de la gente no están respaldados en ninguna parte.** El esquema se
reconstruye en minutos; los 105 perfiles, las 3.976 filas de progreso, los 80
encargados a los que llegan los informes y los 53 planes de clase, no. Y la
organización de Supabase está en el plan **gratuito**, que no hace copias
automáticas de la base — igual que no deja encender la protección contra
contraseñas filtradas, que este archivo ya tenía anotada por lo mismo.

`herramientas/respaldo-datos.sh` es la salida mientras tanto: `pg_dump` con la
cadena de conexión por variable de entorno (nunca escrita en el repositorio) y
la salida en `respaldos/`, que está en `.gitignore` **y** en `.assetsignore`.
Los dos candados son para el mismo descuido: ahí adentro van cédulas y correos
de menores, de git no se borra nada, y el despliegue sube la carpeta de
trabajo, no lo que hay en git.

- **`.assetsignore` ahora excluye `supabase/` entero.** El worker sirve TODO el
  directorio, así que lo que no se excluya queda publicado: las migraciones son
  el modelo de permisos completo, y publicarlas es regalarle a cualquiera el
  mapa de por dónde buscarle la vuelta. Ninguna página las pide.
- **Y también `CLAUDE.md` y los scripts de `herramientas/`**, por la misma
  razón: este archivo explica el modelo de permisos entero. De `herramientas/`
  se excluye todo MENOS `herramientas/cursos/`, porque su `catalogo.json` lo
  piden `planes.html`, la tienda y el catálogo de Tareas — excluir la carpeta
  entera les dejaría la lista de cursos vacía, sin ningún error.
- **Un respaldo que depende de que alguien se acuerde de correrlo, tarde o
  temprano no se corre.** La salida de verdad es el plan Pro, con sus copias
  diarias. Queda escrito acá porque un pendiente que solo vive en la cabeza de
  alguien no existe.

### Al aplicar una migración o desplegar una función, actualizar el respaldo

**Correr `node herramientas/verificar-punto-restauracion.js`** (no necesita
red, ni navegador, ni el sitio servido). Comprueba que no falte ninguna pieza
—las migraciones, las 14 funciones con su código, los inventarios, los cuatro
archivos de Cloudflare— e imprime la **huella** md5 de las migraciones, que se
compara contra la base con la consulta que el propio script deja escrita. Si no
coincide, hay migraciones aplicadas que no están respaldadas. Está probado que
falla de verdad: quitando una migración y una función, saltan las dos.

Un respaldo a medias no da ningún error —la carpeta está, los archivos se
ven— y eso solo se descubre en el peor momento posible.

- **El archivo respaldado es lo que se APLICÓ, byte a byte, y no una versión
  mejor comentada.** Ya pasó una vez: una tanda aplicó su migración sin el
  encabezado de comentarios y después guardó el archivo CON él. El respaldo se
  lee mejor y la huella deja de cuadrar, así que a partir de ahí el verificador
  no puede distinguir «hay algo sin respaldar» de «alguien le agregó una línea
  al archivo». El porqué va en este archivo, que es donde se lee; la migración
  guarda lo que corrió. (Y el md5 se calcula sobre el archivo tal cual, así que
  tampoco lleva el salto de línea final si lo guardado no lo trae.)

`ocr-scoresheet` se bajó tal cual estaba y traía tres formas de voseo
(«Avisá al profesor», «Probá con una foto»). Se corrigieron en el repositorio
y ya está desplegada (versión 2), igual que `admin-manage-users` con su «elegí
un plan».

### La etiqueta del punto de restauración se pone a mano

`RESTAURAR.md` nombra el **commit** del estado bueno, no una etiqueta, y es a
propósito: las credenciales de una sesión de Claude Code en la web empujan
ramas pero reciben un **403 con `refs/tags`**, así que la etiqueta no se crea
sola por más que el commit sí quede en `main`. Un documento que mandara a
`git checkout restauracion-…` con esa etiqueta sin existir sería justo el fallo
callado de siempre: se lee bien, y el día que hace falta no está.

El comando queda escrito en `RESTAURAR.md` para correrlo desde una máquina con
permiso de escribir etiquetas.
