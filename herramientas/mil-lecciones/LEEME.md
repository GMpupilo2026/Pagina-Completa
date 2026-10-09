# Cómo se leyó «Las Mil y una Lecciones de Ajedrez»

Estos programas convierten el PDF del libro del MI Ángel Martín (EDAMI, 2011;
2170 páginas, 360 clases) en los datos del curso «Una clase al día de
ajedrez». **El PDF no está en el repositorio**: es del dueño, que tiene permiso
para publicarlo. Los datos que salen de aquí sí, y son la única copia:
`cursos/protegido/data/una-clase-al-dia.json` y
`cursos/protegido/data/una-clase-al-dia/lNNN.json`. El libro en doce tomos
(`herramientas/mil-lecciones-pdf.js`) sale de esos datos, no del PDF.

El porqué de cada decisión está en `docs/decisiones/cursos-y-material.md`,
sección «El curso y el libro «Una clase al día»».

Hace falta `pip install pymupdf chess==1.10.0 numpy pillow` y Stockfish 16 en
`/usr/games/stockfish`. Todo se corre desde una carpeta de trabajo **fuera del
repositorio** (los intermedios pesan cientos de megas), y en este orden:

    H=<repo>/herramientas/mil-lecciones
    python3 $H/extraer.py libro.pdf ext       # texto en orden de lectura + diagramas
    pdftotext -layout libro.pdf edami.txt     # para el índice de títulos (ver abajo)
    python3 $H/detectar_todos.py              # la rejilla de cada diagrama
    python3 $H/procesar.py                    # las partidas de cada clase (~5 min)
    python3 $H/etiquetar.py                   # diagramas cuya posición ya se conoce
    python3 $H/reconocer.py                   # reconoce las piezas de todos los diagramas
    python3 $H/fragmentos.py                  # partidas que empiezan en un diagrama
    python3 $H/ejercicios.py                  # ejercicios y su solución (clase siguiente)
    python3 $H/motor.py                       # Stockfish: momentos clave y ejercicios (~15 min)
    python3 $H/armar.py                       # arma cada clase
    python3 $H/datos.py <repo>                # escribe los datos del curso
    python3 $H/fragmento.py <repo>            # la página protegida con las 360 lecciones
    python3 $H/paginas.py <repo>              # portada pública y página de la Academia
    node <repo>/herramientas/mil-lecciones-pdf.js
    node <repo>/herramientas/verificar-mil-lecciones.js

`ext/titulos.json` (los 360 títulos) sale del índice del libro en
`edami.txt`: las líneas «  N     Título» entre «Índice de lecciones» y
«Clase: 1».

## Qué hace cada paso

- **extraer.py** — PyMuPDF da cada bloque de texto y cada imagen con su lugar
  en la página. El texto plano de `pdftotext` sale revuelto (las columnas y los
  recuadros se cruzan); ordenado por columna y altura queda en orden de
  lectura, con una marca `⟦DIAG:…⟧` donde va cada diagrama.
- **leer.py / procesar.py** — las partidas. El texto mezcla la línea
  principal, las variantes entre corchetes (que a veces el original abre y no
  cierra) y jugadas citadas en la prosa. Se busca la lectura que más jugadas
  de la línea principal junta y que **llega al resultado**: una variante que
  se cuela se queda atascada antes del «1-0». Cada jugada se juega con
  python-chess; una que no es legal no entra.
- **tablero.py, casillas.py, etiquetar.py, piezas.py, reconocer.py** — los
  diagramas son imágenes. Los que caen dentro de una partida ya leída dicen
  qué posición muestran: con ellos se aprende cómo se ve cada pieza (vecino
  más cercano, 99,7 % de casillas bien) y se reconocen los demás.
- **fragmentos.py / ejercicios.py** — una partida que empieza en la jugada 28,
  o un ejercicio, solo se acepta si **sus jugadas son legales desde la
  posición reconocida**: un error del reconocedor casi siempre deja alguna
  jugada imposible.
- **motor.py** — Stockfish 16 (0,5 s, cuatro líneas) mira cada jugada con «!»
  de la línea principal y la primera jugada de cada ejercicio. Momento clave
  es la que queda a 0,3 peones de la mejor o menos; las que empatan con ella
  van como alternativas. Un ejercicio de táctica tiene que ganar (+1,5 o
  más) y su solución no puede quedar a más de medio peón de la mejor.
