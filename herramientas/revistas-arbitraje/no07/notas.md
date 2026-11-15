# N.º 7 — notas para Oscar

## Qué se hizo

| Artículo original | Edición 2026 | Firma |
|---|---|---|
| Editorial | Condensada (cabe con la tabla de cambios en una página) | Santiago García Ramos |
| Retos psicológicos profesionales | Corregido de estilo, trato de «tú» unificado | Paula Man Reich |
| ¡Ni un árbitro indocumentado! (licencias 2013) | Reescrito: «De la licencia de 2013 al registro de 2026». Tabla de tarifas 2012 como dato histórico | Oscar, a partir de la nota de García Ramos |
| Notación Forsyth | Revisado + sección nueva sobre FEN (turno, enroque, al paso, contadores) y su relación con el art. 9.2.3 | García Ramos, revisado |
| Arbitraje e internet (caso Buchholz) | Revisado y recalculado con el C.07 (2026), art. 16 | García Ramos, revisado |
| Guías rápidas de Swiss Manager 21-30 | Resumidas en una tabla + lo que dice el C.04.1/C.04.2 (2026) | García Ramos, revisado |
| Respuestas (pp. 40-42) | Integradas al final del artículo de Forsyth | — |

## Cambios principales

- **Licencias → cuota de registro.** B.06.1 (vigente desde 1-mar-2026), arts. 6.1-6.2: el «License fee» se llama ahora «registration fee»; sin pago, el torneo puede no valorarse y no se aceptan las normas del árbitro. Títulos vitalicios (art. 1.3). AF solo tras 1 año con licencia de AN (art. 5.4.3).
- **Categorías y actividad.** B.06.3 (vigente desde 1-jul-2026): IA en A-D, AF siempre D; inactivo = 4 años sin curso de actualización (refresher); consecuencias y reactivación. Ya no existe «reactivarse pagando otra licencia».
- **Buchholz.** El jugador virtual de 2009 ya no rige. C.07 (Consejo 2-feb-2026, aplicable 1-mar-2026), art. 16.4.1: muñeco con la puntuación propia, con tope en la puntuación ajustada del rival programado. Niña X = 0 + 4 + 1 + 3 + 3 = **11**; niña Y = **12½** → hoy la protesta del padre tendría razón. El cálculo de 2009 (14) era aritméticamente correcto y se conserva como referencia histórica. El original atribuía la regla al «C.06»: corregido.
- **Fe de erratas Forsyth.** Lista de piezas negras: «Te7» → **Te8**. Respuesta del ejercicio 3: fila 1 «2A1T1R» (7 casillas) → **2A1T1R1**.
- **Swiss Manager.** Se avisa que «asignar descanso» y «emparejamientos prohibidos» solo valen si las bases lo prevén (C.04.2 art. 1.5 prohíbe alterar el emparejamiento correcto). TPN no cambia tras emparejar la 4.ª ronda (art. 2.3).

## Comprobaciones hechas

- Los 7 diagramas (ejemplo, ejercicios 1-3, soluciones 4-6) se transcribieron de las imágenes del PDF y se validaron con chess.js 0.10.3 (`validate_fen`). Las soluciones 4-6 coinciden con los diagramas de las pp. 40-42 del original.
- Cálculos del Buchholz (sin ajuste, 2009 y 2026) rehechos con un script.

## Lo que no pude verificar

- **Cuotas actuales de registro de árbitros**: el B.06.1 remite al reglamento financiero y no da cifras; no encontré una tabla oficial vigente. En el texto se pide consultarlas con la federación. No se publican cifras actuales.
- **Fecha exacta de publicación del N.º 7**: el original no la trae; por el contenido (plazo FIDE del 5 de diciembre, «a partir de 2013») se puso «los últimos meses de 2012».
- **Decisión del Consejo Presidencial de Cracovia (2011)** sobre la licencia y la tabla de tarifas de 2012: se reproducen como lo decía la nota original, sin fuente FIDE consultada.
- **B.06.3**: la página del Handbook no muestra fecha de aprobación, solo «vigente desde 1-jul-2026».
- **Menús de Swiss Manager**: son los de la versión de 2012; no pude comprobar la versión actual del programa. Se indica en el texto.
- **Turno de las posiciones de Forsyth**: el original no lo da; en los diagramas se supone «juegan las blancas» y se dice.
- **Resultados por ronda de la niña X**: son una deducción del original (no un dato) y se supone que los rivales no tuvieron otras partidas no jugadas; ambas cosas se dicen en el texto.
- **Muerte de David Forsyth en 1909**: dato del original, no verificado en fuente.

## Fichas (fichas.json)

5 fichas (`registro-arbitros`, `notacion-fen`, `buchholz-no-jugadas`, `gestion-suizo-programa`, `creencias-arbitro`), 30 preguntas (6/6/7/6/5) y 1 caso (`buchholz-incomparecencias`). Sin repeticiones. La posición de la respuesta correcta está repartida entre las cuatro opciones.
