# Revistas «Arbitraje de Ajedrez»: cómo se generan

Los 18 números de la revista (2012-2014, dirigida por Santiago García Ramos),
revisados y actualizados a la normativa FIDE vigente en noviembre de 2026 por
IA Oscar Angulo Cubero, y dos ediciones especiales nuevas: el N.º 19, la guía paso a paso de Pareo Integral
y la mesa del árbitro, y el N.º 20, el manual completo de la mesa del árbitro del
Centroamericano. De acá salen dos cosas del sitio:

- los PDF de `descargas/aula-arbitraje/revista-NN.pdf` (con candado: solo con
  la licencia de la Aula; ver `ARCHIVOS_CON_LICENCIA` en `worker.js`), y sus
  portadas `img/aula-arbitraje/portada-NN.jpg`;
- las fichas, preguntas y casos de los números 2 en adelante en
  `js/aula-arbitraje/contenido-revistas.js` (el N.º 1 está escrito a mano en
  `js/aula-arbitraje/contenido.js`).

Nada de eso se edita a mano: se cambia la fuente de acá y se vuelve a generar.
El contexto está en «Aula de Arbitraje» y «El Taller del árbitro, las
calculadoras y el PDF de cada revista» de `docs/decisiones/juegos-y-torneos.md`.

## Qué hay

| Archivo | Para qué |
|---|---|
| `generar.js` | Arma el PDF de cada número (portada, presentación, cuerpo, marca de agua y metadatos). |
| `ilustraciones.js` | La ilustración vectorial del centro de cada portada, una por número. |
| `estilo.css` | El estilo de las revistas. |
| `noNN/meta.json` | Portada y página «Sobre esta edición»: temas, editorial, tabla de cambios, directorio. |
| `noNN/cuerpo.html` | Los artículos. |
| `noNN/fichas.json` | El material del número para la Aula (fichas, preguntas, casos). |
| `noNN/notas.md` | Notas internas: qué cambió y qué no se pudo comprobar. |
| `no01/armar.py` | El N.º 1, hecho antes del generador común: `template.html` + `M.json` (la tabla del Koya). |
| `no09/armar.js`, `no09/calc.js` | El N.º 9 arma su `cuerpo.html` desde `cuerpo.fuente.html` (tabla de probabilidades); `calc.js` comprueba sus cálculos. |
| `no19/capturas.js` | Saca las capturas del N.º 19: juega un torneo de prueba en `pareo.html` y abre la mesa del árbitro con un doble de Supabase (como los verificadores). Deja las imágenes en `no19/capturas/`. |
| `no20/capturas.js` | Saca las capturas del N.º 20 (la mesa del árbitro del Centroamericano): la tableta del adjunto y la página de la organización, con los dobles de Supabase de los verificadores (`lib/doble-centroamericano-*.js` y el de Fair Play de `verificar-centroamericano-fair-play.js`), con los nombres cambiados por otros inventados. |
| `no10/orden.js` | Comprueba el orden inicial (rating, título, nombre) del ejemplo del N.º 10. |
| `armar-aula.py` | Junta los `fichas.json` en `js/aula-arbitraje/contenido-revistas.js`. |
| `revisar.py` | Revisa un número terminado: marca de agua y crédito en cada página, metadatos, estructura de `fichas.json`, tuteo. |

Las revistas originales (PDF de 2012-2014) **no van en el repositorio**: son
del autor original y solo se usaron como fuente.

## Cómo se genera

```bash
npm install
node herramientas/revistas-arbitraje/generar.js todas        # o: … generar.js 3 8 11
node herramientas/aula-portadas.js                          # las portadas de las fichas
python herramientas/revistas-arbitraje/armar-aula.py        # si cambió algún fichas.json
node herramientas/sello-estampar.js
node herramientas/archivos-catalogo.js                      # los tamaños en data/archivos.json
```

- `MUESTRA=1 node herramientas/revistas-arbitraje/generar.js 3` saca solo la
  portada en PNG (en la carpeta temporal del sistema) para mirarla.
- Necesita `pypdf` en Python (`pip install pypdf`) y Playwright con Chromium.
- El generador se detiene si un FEN del cuerpo o de la ilustración es ilegal,
  o si el texto menciona inteligencia artificial o un asistente.
- Con las mismas fuentes, los PDF y las portadas salen idénticos byte a byte:
  si `git status` muestra cambios en `descargas/` después de generar sin tocar
  nada, algo del entorno cambió (las fuentes tipográficas, la versión de
  Chromium) y hay que mirarlo antes de subirlo.
- Después de generar: subir los PDF nuevos a la carpeta de Drive de las
  revistas (los viejos, a la papelera).

## Un número especial y las capturas

- Con `"especial": { "edicion": …, "sello": … }` en `meta.json`, la portada dice
  «Autor» en vez de «Revisión y actualización», lleva ese sello, y la
  presentación no trae la tabla de cambios (no es una revista vieja actualizada).
- Una captura va en el cuerpo como `<figure class="captura"><img src="capturas/archivo.jpg" alt="…"><figcaption>…</figcaption></figure>`
  (`captura media` la achica); el generador la incrusta en el PDF y se detiene si falta.
  Los pasos numerados van en `<ol class="pasos">` y un botón de la pantalla, en `<span class="boton">`.
- Si cambia la pantalla de Pareo Integral o de la mesa, se vuelven a sacar las
  capturas (`node herramientas/revistas-arbitraje/no19/capturas.js`) y se genera
  el N.º 19. Los jugadores son inventados y el torneo no se publica (la función
  `pareo-publicar` tiene un doble).
- Cada número nuevo es una carpeta `noNN/` más: el generador, el armador y
  `verificar-aula-arbitraje.js` cuentan las carpetas.

## Formato de `cuerpo.html`

Uno o más `<section class="page">` por artículo, con las clases de `estilo.css`:

- `<div class="kicker">Sección</div><h2 class="sec">Título</h2>`
- `<div class="byline">Por <autor original> — revisión y actualización: IA Oscar Angulo Cubero, conforme a …</div>`
- `<div class="cols">…</div>` texto a dos columnas; `h3`, `h4`, `p`, `ul/ol`.
- Recuadros: `box law` (la norma, con `<span class="tag">Art. X · Leyes 2023</span>`),
  `box warn`, `box ok`, `box new` (novedad respecto al original), `box`.
- Tablas; `table class="calc"` para cálculos y `table class="xt"` para cruzadas.
- Tableros: `<div class="tablero" data-fen="FEN completo" data-pie="texto"></div>`
  dentro de `<div class="boards">…</div>`.
- Una sección final «Fuentes normativas de esta edición».

## La ilustración de la portada

Cada número tiene una entrada en `ilustraciones.js`: una función `dibujo()` que
devuelve un `<svg>` con los colores de la portada (dorado, blanco y celeste
sobre azul). Si dibuja un tablero, la entrada lleva su `fen`, que sale de una
posición de la propia revista; el generador la valida con chess.js. Las piezas
son el set ilustrado del sitio (`js/chess-piece-svg.js`). Un artículo citado en
la leyenda tiene que ser el de la norma vigente, igual que en el cuerpo.

## Reglas del contenido

- Todo lo reglamentario se comprueba contra el documento FIDE vigente y se
  cita con su artículo. **Nunca se inventa un número de artículo, una cifra o
  una fecha**: si no se pudo comprobar, se dice con prudencia en el texto y se
  anota en `notas.md`.
- Lo que ya no rige se corrige o se reemplaza, y se dice en `cambios`.
- Los artículos que no son reglamento (psicología del deporte, editoriales) se
  conservan con su autor original. Los autores originales se respetan siempre
  (Santiago García Ramos, Paula Man Reich, Carlos Calleros…); la revisión va a
  nombre de «IA Oscar Angulo Cubero» (IA = Árbitro Internacional).
- Ninguna mención de inteligencia artificial, asistentes o herramientas de
  generación en ningún texto.
- **Ninguna posición de ajedrez se inventa**: todo diagrama o secuencia se
  comprueba con chess.js, y si la explicación dice mate, tablas o repetición,
  también.
- Español latinoamericano, tuteo y nunca voseo, «tenedor» y nunca «horquilla».
- Las cifras de los ejemplos se recalculan con un script; un error del
  original se corrige y se anota en `cambios` como fe de erratas.

## Formato de `fichas.json`

El mismo de `js/aula-arbitraje/contenido.js`: `coleccion`, `fichas` (`id`,
`coleccion`, `titulo`, `articulos`, `resumen`, `claves`, `contenido`),
`preguntas` (`ficha`, `texto`, `opciones`, `correcta`, `explicacion`), `casos`
y `repeticiones`. Ids en minúsculas con guiones; `armar-aula.py` renombra los
que se repiten entre números. Clases del contenido: `aula-norma`,
`aula-norma aula-norma-aviso`, `aula-formula`, `aula-tabla`, `aula-nota`. Lo
revisa `herramientas/verificar-aula-arbitraje.js`.
