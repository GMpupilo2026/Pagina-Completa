# N.º 21 · notas internas

El Seminario de Árbitro FIDE completo. Cada parte la escribió su autor con el material
corregido del curso; abajo, sus notas tal cual (fuentes, lo no comprobado, correcciones).


## Parte A

# Parte A — Leyes del Ajedrez I: las reglas básicas del juego

## Qué contiene
- `a-cuerpo.html`: 6 artículos (Arts. 1 y 2; Art. 3 movimientos y jaque; enroque, al paso y promoción;
  Art. 4 pieza tocada; Art. 5 finalización; Art. 7 irregularidades e ilegales), cada uno con su recuadro
  «Practica» (5 a 8 ejercicios, 37 en total), y la sección final «Soluciones de la práctica».
  10 tableros.
- `a-fichas.json`: 4 fichas (`r21-a-movimientos-especiales`, `r21-a-pieza-tocada`,
  `r21-a-fin-de-partida`, `r21-a-irregularidades-ilegales`), 32 preguntas (8 por ficha), 2 casos
  (`r21-a-caballo-clavado`, `r21-a-abandono-sin-mate`).

## Posiciones
Los 10 FEN se comprobaron con chess.js (0.10.3 del repositorio): FEN válido y el bando que no mueve
no está en jaque. Además se comprobó cada afirmación:
- 0-0-0 ilegal y 0-0 legal con la dama negra en d5 (d1 atacada); 0-0-0 legal con el alfil de h7 atacando b1.
- Tras 1.e4 d5 2.e5 f5: exf6 a.p. legal, exd6 no.
- Rc6 + peón c7 contra Ra7: c8=D es ahogado; tras c8=T el negro tiene 1…Ra6 (posición hallada con
  una búsqueda exhaustiva en chess.js).
- 1.f3 e5 2.g4 Dh4# es mate; Rh8 / Df7 + Rg6 con turno negro es ahogado; R+A contra R es material
  insuficiente; en la posición del caballo clavado, Cxe3 no está entre las jugadas legales y sí Dxe3 y fxe3.
- La posición muerta con peones bloqueados se menciona solo en texto, sin diagrama (chess.js no la detecta).

## Fuentes (con versión)
- Leyes del Ajedrez de la FIDE, en vigor desde el 1-ene-2023, FIDE Handbook E.01
  (https://handbook.fide.com/chapter/E012023), consultado en nov-2026: arts. 1, 2, 3, 4, 5, 6.2.1, 6.11.2, 7
  y Apéndice A (A.3, A.5.2).
- Curso del seminario: «(1) LEYES-DEL-AJEDREZ-DE-LA-FIDE- 189 Seminar - corregido.pdf» y
  «LEYES-DEL-AJEDREZ-DE-LA-FIDE- enero 26 - corregido.pptx» (IA Oscar Angulo Cubero).
- `js/arbitro-seminario/contenido.js`, temas «tocada» e «ilegal» (preguntas y FEN reutilizados).

## Correcciones a la fuente
- `contenido.js` (tema «tocada», pregunta de la promoción) cita el **art. 4.6.3** para «la elección es
  definitiva cuando la pieza toca la casilla de promoción». En las Leyes 2023 eso es el **art. 4.4.4**;
  el 4.6.3 dice que, si en la casilla de llegada hay una pieza rival, debe capturarse. En esta parte se
  cita el 4.4.4. Conviene corregir `contenido.js` (no se tocó: está fuera de esta carpeta).
- El curso (pdf/pptx) resume el art. 7.5.5 sin la excepción de tablas («si el rival no puede dar mate»);
  se añadió. También se añadió que el 7.1 incluye el derecho a no cambiar los tiempos y a ajustar el
  contador de jugadas.
- Matiz: `contenido.js` dice «toca deliberadamente una pieza» para el 4.3. El 4.3 vigente dice «con la
  intención de mover o capturar» («deliberately» aparece en el 4.4.2, torre primero); acá se usa la
  redacción del 4.3.

## Lo que no se pudo comprobar del todo, o se dijo con prudencia
- **Apéndice B (relámpago):** el texto dice que el minuto de sanción rige también en relámpago, citando
  solo «Apéndice B», sin subnúmero: la consulta del Handbook indicó que B.3 remite a A.2, A.3 y A.5, y el
  curso (pdf) numera distinto (B.2 / B.3). Revisar el subnúmero antes de citarlo con precisión.
- **Art. 6.11.2** (detener el reloj para pedir la pieza de promoción): el contenido coincide con el curso;
  el subnúmero no se verificó palabra por palabra en el Handbook.
- **Intervención del árbitro en la pieza tocada:** el texto solo dice que las Leyes la plantean como un
  derecho de reclamación del rival (4.8). No se afirma si el árbitro debe o no intervenir de oficio
  (`contenido.js` dice que no; eso es criterio del Manual del Árbitro, no del texto de las Leyes).
- **Colores cambiados después de 10 jugadas:** el recuadro sobre registrar el resultado con los colores
  realmente jugados es una recomendación práctica; las Leyes (7.3) no regulan ese trámite y así se dice.
- **Formas de abandonar** (verbal, firmando, tendiendo la mano): se presentan como práctica, no como
  texto de las Leyes.
- El caso de la «torre invertida» del pptx no se incluyó: no está en el texto de las Leyes 2023 (es
  criterio del Manual del Árbitro y ya lo trata el N.º 2).
- «Varias infracciones en una misma acción cuentan como una ilegal» viene de `contenido.js`; no es una
  frase literal de las Leyes, sino la lectura de que el 7.5.5 sanciona la jugada completada.

## Límites con otras partes
No se tratan: reloj y bandera (art. 6, salvo la definición de jugada completada), anotación (8), tablas
por reclamo, 50/75 jugadas y repeticiones (9), conducta y sanciones (11, 12) ni los apéndices en detalle:
eso es Leyes II (parte B). Se remite a esa parte en dos recuadros.


## Parte B

# Parte B — Leyes del Ajedrez II (notas internas)

Tema: reloj y bandera (art. 6), anotación (art. 8 y Apéndice C), tablas (art. 9),
puntuación (art. 10), conducta (art. 11), el árbitro y el 12.9 (art. 12), y los
Apéndices A, B, D y la Guía III.

## Qué se entrega

- `b-cuerpo.html`: 6 artículos (reloj; planilla y notación; tablas y puntuación;
  conducta; árbitro y sanciones; modalidades) + «Soluciones de la práctica».
  Cada artículo cierra con su recuadro «Practica» (5 a 7 ejercicios; 37 en total).
  6 tableros. Unas 7.000 palabras contando las tablas de soluciones y los
  recuadros de práctica (más de lo orientativo: el temario de esta parte es amplio).
  Si hace falta recortar, lo primero prescindible es el detalle del Apéndice D y
  la tabla de modalidades del reloj.
- `b-fichas.json`: 4 fichas (`r21-b-reloj-bandera`, `r21-b-planilla-tablas`,
  `r21-b-conducta-sanciones`, `r21-b-rapidas-blitz`), 32 preguntas (8 por ficha,
  respuesta correcta rotada entre 0 y 3) y 2 casos (`r21-b-bandera-caballo`,
  `r21-b-triple-escrita`). Las preguntas no llevan FEN.

## Posiciones (todas comprobadas con chess.js 0.10.3 del repositorio)

Se comprobó: FEN válido, el bando que no mueve no está en jaque, y mate/ahogado
cuando el texto lo dice.

- `8/8/8/3k4/8/2K5/2P5/7R w - - 0 1`: bandera del blanco; el negro solo tiene rey → tablas (6.9).
  (Un primer borrador tenía la torre en d1 dando jaque al rey negro con turno blanco: posición
  ilegal que chess.js no marca como inválida; se corrigió.)
- `6r1/8/8/3k4/8/8/2N5/4K3 b - - 0 1`: bandera del negro; R+C contra R+T → gana el blanco.
- `6rk/5N2/7K/8/8/8/8/8 b - - 0 1`: el mate ayudado de ejemplo (jaque mate comprobado). Un primer
  borrador ponía el rey blanco en g6, donde lo atacaba la torre de g8 (ilegal); se movió a h6.
- `k7/2Q5/1K6/8/8/8/8/8 b - - 0 1`: ahogado (tomada de `contenido.js`).
- `7k/6p1/7p/3Q4/8/8/rr3PPP/6K1 w - - 0 1` y la secuencia 1.Dd8+ Rh7 2.Dd3+ Rg8 3.Dd8+ Rh7
  4.Dd3+ Rg8 5.Dd8+ Rh7: chess.js da `in_threefold_repetition()` verdadero solo después de 5…Rh7.
  Posición final `3Q4/6pk/7p/8/8/8/rr3PPP/6K1 w - - 10 6`.
- Respuesta de práctica (R+A contra R+peón, bandera del negro): existe el mate
  `8/8/8/8/3B4/8/p7/k1K5 b - - 0 1` (comprobado).

## Fuentes

- FIDE Laws of Chess taking effect from 1 January 2023 (aprobadas por la Asamblea General el
  07/08/2022), FIDE Handbook E.01, https://handbook.fide.com/chapter/E012023, leídas el
  20-nov-2026; el índice del Handbook no muestra una versión posterior. Se comprobaron contra el
  texto inglés: arts. 6.1–6.12, 8.1–8.7, 9.1–9.6, 10, 11.1–11.12, 12.1–12.9, Apéndices A, B, C, D,
  Guía III y las entradas «increment», «delay (Bronstein) mode», «normal means» y «quickplay
  finish» del glosario.
- Curso del seminario: «(1) LEYES-DEL-AJEDREZ-DE-LA-FIDE- 189 Seminar - corregido.pdf» (78 pp.) y
  «LEYES-DEL-AJEDREZ-DE-LA-FIDE- enero 26 - corregido.pptx» (102 diapositivas; mismo texto que el PDF).
- `js/arbitro-seminario/contenido.js`, temas «reloj», «tablas», «conducta» y «relojes»
  (preguntas reutilizadas o adaptadas).

## Correcciones respecto a la fuente del curso

- **A.1 / B.1**: el curso define rápida y blitz solo por el tiempo fijo; el texto vigente añade
  «o el tiempo asignado más 60 veces el incremento». Se usa la definición completa.
- **B.3**: el curso dice que, sin un árbitro por partida, rigen «A.2 y A.5»; el texto oficial dice
  **A.2, A.3 y A.5** (también la sanción de un minuto).
- **11.3.2**: el curso dice «en la sala de juego»; el texto oficial dice *playing venue*
  (recinto de juego). Se usa «recinto».
- **12.9**: la diapositiva resume en cuatro grupos; se listan las nueve opciones, incluida la
  multa anunciada de antemano (12.9.7).
- **A.5.1.2**: se añade lo que el curso deja como pregunta («¿qué pasa con el enroque?»): con el rey
  mal colocado no se enroca; con la torre mal colocada no se enroca con esa torre.
- `contenido.js` (tema «relojes») distingue «Bronstein» y «retardo»; las Leyes solo describen la
  «modalidad de demora» (6.3.2) y el glosario la rotula «delay (Bronstein) mode». En la revista
  se habla de incremento acumulativo y de demora según 6.3.2, sin entrar en la distinción.

## Lo que no se pudo comprobar o es interpretación

- «Lo normal es una advertencia» por pulsar con la otra mano (6.2.3) y la columna «cuándo suele
  usarse» de la tabla del 12.9 son criterio de instructor, no texto de las Leyes (el 12.9 no
  asigna sanciones a faltas concretas). Así se presenta en el texto.
- Que escribir variantes en la planilla sea «usar notas» (11.3.1) es una lectura conjunta de
  8.1.4 y 11.3.1, no una frase literal de las Leyes.
- La clasificación de 30′ + 30″ como «no rápida» sale de A.1 («menos de 60»); qué lista de rating
  le corresponde lo trata el Reglamento de Rating (otra parte), y aquí no se afirma.
- No se citan artículos del Reglamento de Juego Limpio (parte C): solo se remite a «otra parte de
  esta edición».


## Parte C

# Parte C — Regulaciones Generales y juego limpio: notas

## Qué hay
- `c-cuerpo.html`: 5 artículos + «Soluciones de la práctica» (33 ejercicios en total).
  1. Las bases mandan: las Regulaciones Generales para Competiciones (alcance, L1-L3, qué fijan las bases, qué rige si no dicen nada, retiros).
  2. La sala de juego y el material: el estándar C.02 (GR 3.2, 4 y 11; tablero, piezas, mesas, planillas, relojes mecánicos; prensa).
  3. Quién hace qué: organizador, árbitros y capitanes (GR 2, 3, 6, 7, 9, 13; Leyes 12.2, 12.4, 12.6; vestimenta y conducta).
  4. Cuando hay desacuerdo: el comité de apelaciones (GR 10; C.11; Leyes 11.10; diagrama de pasos).
  5. Juego limpio en la sala: lo que el árbitro hace y lo que no (Leyes 11.3, 12.2, 12.8, 12.9; FPR 1.7, 3.2, 4.11; división de tareas CA-CFPO).
- `c-fichas.json`: 4 fichas, 32 preguntas (8 por ficha, respuestas correctas repartidas 8/8/8/8 entre 0-3), 2 casos.
- No hay tableros ni FEN en esta parte (no hacía falta ninguna posición).
- Para no repetir el N.º 18, el artículo 5 no vuelve a explicar la tabla de niveles de protección, los umbrales z ni la jurisdicción: remite a ese número.

## Fuentes usadas (todas leídas en el FIDE Handbook en noviembre de 2026)
- Regulaciones Generales para Competiciones, C.05 (PDF `Competition_Rules.pdf`; encabezado: «Approved by the 1986 General Assembly, 2007 PB; amended by the 1989 … 2018 General Assemblies and 2011 Executive Board»). Leído completo.
- C.11 Appeals Committee Procedural Rules (aprobadas por el Consejo FIDE el 28-04-2022, aplicadas desde el 01-01-2023). Leído completo.
- C.02-01 General Regulations y C.02-02 Chess Equipment without Electronic Components (aprobados por el Consejo FIDE el 11-12-2025, aplicados desde el 01-03-2026). El 02 leído completo; del 01 solo el art. 5.2.
- Leyes del Ajedrez en vigor desde el 01-01-2023 (E.01): arts. 6.7, 9.1.1, 10.1, 11 completo, 12 completo, A.6, B.4 y glosario.
- Fair Play Regulations (aprobado 10-11-2024, aplicado desde el 18-11-2024), A.09. Leído completo.
- Chief Arbiter – Chief Fair Play Officer Division of Tasks (misma fecha). Leído completo.
- Fuentes del curso: «Regulaciones Generales para Competiciones de la FIDE – julio 2025 – corregido» y «Leyes antitrampas – corregido» (Drive), y los temas «regla» y «fairplay» de `js/arbitro-seminario/contenido.js` (reutilicé sus preguntas sobre apelación válida, incomparecencia cero, sospecha en voz baja, «juega más que su Elo» y el caso de las apelaciones orales en 24 h del cuaderno).
- Coherencia con el N.º 18 (`no18/cuerpo.html` y `no18/fichas.json`).

## Lo que no pude comprobar
- **«Julio 2025»:** el texto publicado en el Handbook (C.05) no tiene fecha de 2025; su encabezado termina en las enmiendas de 2018. No encontré una versión de julio de 2025 distinta. Por eso el cuerpo cita «Regulaciones Generales para Competiciones (FIDE Handbook, C.05)» sin fecha. Si existe un texto de 2025 con otra numeración, hay que revisar las citas (todas siguen el PDF actual del Handbook).
- **C.02 «General Regulations» (01):** solo leí el art. 5.2 (a qué torneos obliga el material). No leí la parte de material electrónico (03) ni la de equipo certificado (04): no se citan.
- **Mesas:** las medidas del art. 7.1 de C.02-02 rigen «para las competiciones bajo la tutela de EVE y GSC»; así lo digo, sin extenderlo a todos los torneos.
- **Medidas de protección:** remito al N.º 18 y no doy cifras nuevas; no volví a leer las Fair Play Protection Measures.
- **Código de vestimenta:** no hay un texto FIDE único; GR 9.2 remite al «Code of Ethics, art. 3.2», que ya no rige (lo reemplazó el Ethics & Disciplinary Code de 2022, que no leí). El texto solo dice que lo fijan las bases y que el árbitro también debe cumplirlo (falta del B.06.5, art. 3.4, según el N.º 18).
- **Desestimar una queja en el torneo:** el FPR 3.2.6 da esa facultad expresamente al oficial principal de juego limpio; no está claro si el árbitro principal (cuando no hay oficial) puede desestimarla. El texto no lo afirma.

## Correcciones a las fuentes del curso
- **Capitán y tablas:** la diapositiva de la fuente dice que el capitán «no puede aconsejar sobre ofertas de tablas». Es al revés: GR 7.7 le permite aconsejar ofrecer o aceptar tablas, salvo que las bases lo prohíban; lo que no puede es intervenir de otra forma ni comentar posiciones.
- **Art. 11.3.2 de las Leyes:** la fuente de juego limpio lo resume como «puede ser sancionado con la pérdida, dependiendo de las reglas del torneo». El texto vigente dice que pierde y el rival gana (11.3.2.2), salvo que las bases fijen una sanción menos severa; y la opción de guardarlo apagado en el bolso existe solo si las bases la prevén (11.3.2.1). Corregido.
- **Desestimación de quejas:** la fuente dice que el árbitro principal puede desestimar la queja durante el torneo; el FPR 3.2.6 lo dice del oficial principal de juego limpio. Ver arriba.
- **Rechazo por la FPL:** la fuente dice «por mayoría de votos»; el FPR 4.3 dice que puede rechazarla el presidente de la FPL. No lo uso en el texto.
- **Envío de quejas:** la fuente dice «a la FPL a través de la Oficina de la FIDE»; el FPR 3.2.2 da una dirección de correo de la FPL (no la pongo, por la regla de no publicar contactos) y 3.2.6 dice que el árbitro envía la queja y su informe a la FPL y a la Comisión de Árbitros (ARB).
- **Comité de apelaciones:** la fuente omite que el comité debe tener número impar de votantes, miembros de 21 años o más, y que el involucrado no juzga (GR 10.2). Añadido.
- **Referencias viejas dentro del propio GR (no se citan en la revista):** GR 2.2 remite a «A.10 Anti-cheating Guidelines» (hoy el juego limpio está en A.09, «Anti-Cheating Regulations»); GR 8 remite por error a C.02 para los desempates (son C.07); GR 12.3, punto 9, habla de «A3 o A4, B3 o B4» (hoy Leyes A.6 y B.4, que eligen entre A.4/A.5 y B.2/B.3). En el texto cito la norma vigente.
- **Ejemplos con nombres reales** de la fuente de juego limpio (casos de trampas): no los uso.

## Extensión
- Unas 6.900 palabras contando la práctica y la tabla de soluciones (unas 5.100 sin ellas): algo más que la orientación; si hay que recortar, lo más prescindible es la lista de requisitos de C.11 y la tabla de piezas.


## Parte D

# Parte D — Sistemas de juego y desempates: notas

## Qué contiene
- `d-cuerpo.html`: 5 artículos (todos contra todos; suizo holandés I; suizo holandés II
  con el ejemplo de emparejamiento; desempates I con la cruzada de un todos contra todos;
  desempates II con las rondas no jugadas y el suizo completo) y «Soluciones de la práctica».
  Sin tableros (el tema no los necesita).
- `d-fichas.json`: 4 fichas, 32 preguntas (8 por ficha), 2 casos.
- `calculos/desempates.js`: comprueba todas las cifras. `node herramientas/revistas-arbitraje/no21/calculos/desempates.js`
  debe terminar en «Todo bien». Hace:
  - tablas Berger de 6 y 8 contra las del Anexo 1 del C.05;
  - la cruzada de 6 (puntos, DE, SB, KS, WIN) calculada a mano en el script y comparada con
    `js/pareo/desempates.js` (traducción de chesspairing, ya verificada contra los ejemplos del C.07:2026);
  - el suizo de 8 a 5 rondas: cada ronda se empareja con el motor de Pareo Integral
    (bbpPairings, TRF con `FIDE_DUTCH_2026`) y se exige que salgan las parejas de la revista;
    luego BH y BH-C1 con el art. 16 calculados en el script y comparados con `desempates.js`;
  - la ronda 1 de 9 y de 11 jugadores, el orden inicial (rating, título, nombre) y las cuentas
    de los recuadros «Practica».

## Fuentes y versiones
- C.04.1 Reglas básicas, C.04.2 Reglas generales de gestión y C.04.3 Sistema FIDE (holandés):
  aprobados por el Consejo FIDE el 28-oct-2025, vigentes desde el 1-feb-2026 (FIDE Handbook,
  handbook.fide.com, consultado en noviembre de 2026).
- C.07 Reglamento de Play-off y Desempates: aprobado por el Consejo FIDE el 2-feb-2026,
  aplicable desde el 1-mar-2026 (Handbook). Comparado con la versión del 1-ago-2024 (aprobada el 29-jul-2024).
- C.05 Regulaciones Generales para Competiciones, Anexo 1 (tablas Berger) y Anexo 2 (tablas Varma).
- Presentación «Suizo - actualizado 2026» (IA Oscar Angulo Cubero) y PDF «Reglamento de
  Desempates de la FIDE — julio 2025 — FA Seminar — corregido» (Drive).
- Temas «sistemas», «desempates» y «suizo» de `js/arbitro-seminario/contenido.js` (preguntas reutilizadas).
- Coherencia con los N.º 3 y 4 de la revista (rival ficticio del art. 16, misma cita del C.07 de 2026).

## Decisiones y correcciones a la fuente
- **Versión del C.07.** Las instrucciones y el PDF de Drive hablan del reglamento «de julio
  de 2025». En el Handbook no figura una versión de julio de 2025: la lista es 1-sep-2023,
  1-abr-2024, 1-ago-2024 (hasta el 28-feb-2026) y **1-mar-2026** (aprobada el 2-feb-2026),
  que es la vigente en noviembre de 2026 y la que ya citan los N.º 2, 3 y 4. Usé esa.
  Conviene que quien junta las partes unifique la cita en «Fuentes normativas».
- El PDF de Drive (art. 16.4) describe el rival ficticio **sin tope** («concluyó el torneo con el
  mismo número de puntos que el participante»): es la redacción de 2024. La de 2026 agrega los
  topes de 16.4.1 (incomparecencias: puntuación ajustada del rival programado) y 16.4.2 (demás
  categorías: puntos de tablas × número de rondas). La revista usa la de 2026 y lo marca como novedad.
- El PDF dice que las regulaciones «entraron en vigor el 1 de setiembre de 2023»: eso fue para
  los eventos de la FIDE; no lo repetí.
- La presentación del suizo tenía partes en imágenes (ejemplos de grupos); el ejemplo de la
  revista es propio (8 jugadores inventados) y está comprobado con el motor.
- El tema «desempates» del seminario recomienda «todos contra todos: encuentro directo,
  Sonneborn-Berger, victorias». El C.07 de 2026 no trae un anexo de desempates recomendados;
  lo presenté como práctica habitual, no como norma. Lo que sí es norma: Buchholz prohibido en
  todos contra todos (art. 8) y desempates por rating fuera si hay jugadores sin rating salvo
  reglas previas (art. 10).

## Lo que no pude comprobar del todo
- **Tablas Varma:** el Handbook describe el procedimiento (grupos A-D, sobres, federaciones
  más numerosas primero) pero no dice expresamente su propósito. La frase «la idea es que esos
  compatriotas se enfrenten pronto» es la explicación habitual de los cursos; está dicha con prudencia.
- **STD, TPN y RTNG** figuran en el C.07 de 2026 (arts. 7.7, 7.8 y 10.6) y no aparecían en la
  tabla de la versión de 2024 que consulté; no afirmo en el texto que sean nuevos.
- El art. 16.5.1 dice que se corta la menor aportación de una VUR «siempre que no sea menor que
  el valor menos significativo»; en el Buchholz siempre se cumple. Seguí la interpretación de la
  presentación del seminario y de chesspairing (en el SB se corta el mayor de los dos valores).
- El motor de emparejamientos (bbpPairings, commit 8f9e3c5) se usa con el modo `FIDE_DUTCH_2026`
  de Pareo Integral; no revisé su código. El razonamiento de la ronda 2 del ejemplo está hecho a
  mano con los arts. 3 y 5 del C.04.3 y coincide con el motor. Las rondas 3 a 5 solo se comprobaron
  con el motor (no se explican paso a paso en el texto).
- El texto de 4.1.1 del C.07 (al que remite el art. 2) no lo cité: escribí «arts. 2 y 4.1».
- Extensión: unas 7.300 palabras contando tablas y soluciones (el texto corrido está cerca de
  las 5.000); si sobra espacio, se puede recortar el bloque «El eliminatorio, en dos líneas» o
  la tabla de criterios de calidad.


## Parte E

# N.º 21 · Parte E — Rating, títulos y el inglés del árbitro — notas

## Qué contiene
Cinco artículos, cada uno con su recuadro «Practica», y la sección «Soluciones de la práctica»:

1. **Rating FIDE · 1 — La lista, las partidas que cuentan y el primer rating** (B.02 arts. 0.2, 0.4, 1.1, 1.2, 2.1, 3.1, 4.1, 5.1, 6.1, 6.2, 7.1-7.2, 8.2, 9.1, 9.2, 10.1). Ejemplo: rating inicial de «Lucía» (1756). Práctica de 7 ejercicios.
2. **Rating FIDE · 2 — La fórmula, la tabla de probabilidades y el factor K** (B.02 arts. 8.1.2, 8.3.1-8.3.4). Tabla 8.1.2 completa. Ejemplo: torneo de «Andrés», 1975, 7 partidas, ΣΔR +0,51 → +10 (K 20) / +20 (K 40), con una diferencia de 415 cortada a 400. Práctica de 7.
3. **Títulos de jugadores, normas y el «performance»** (B.01 arts. 0.3, 0.4, 0.6.2, 1.1, 1.2, 1.3, 1.4.1-1.4.9, 1.5, 1.5.6, 1.8, 1.9, 1.10.1 y anexo de 9 rondas). Tabla p → dp (mitad positiva). Ejemplo: norma de MI de «Valeria» (Ra 2297; 6½ → 2463 sí; 6 → 2422 no), cotejado con el anexo. Práctica de 7.
4. **Del Árbitro Nacional al Árbitro Internacional** (B.06.1 vigente desde el 1-mar-2026, arts. 1-6). Recuadro con lo que cambió el 1-mar-2026. Ejemplo: el camino de «Sofía» al AF. Práctica de 8.
5. **El inglés del árbitro** (módulo I1.1 English Terms; Leyes 2023; B.06.1 arts. 3.3 y 4.3). Glosario inglés–español de unos 50 términos, 10 frases para la sala y falsos amigos. Práctica de 6.

Fichas: 4 (`r21-e-rating-fide`, `r21-e-normas-jugadores`, `r21-e-titulos-arbitro`, `r21-e-ingles-arbitro`), 32 preguntas (8 por ficha), 2 casos (`r21-e-caso-ritmo-abierto`, `r21-e-caso-norma-principal`). No hay posiciones de ajedrez (ningún FEN) en esta parte.

## Cálculos
Todos los números de los ejemplos, de las prácticas y de las preguntas están en `calculos/rating.js` (`node herramientas/revistas-arbitraje/no21/calculos/rating.js` → «Todo comprobado.»). Usa las tablas 8.1.1 y 8.1.2 copiadas del Handbook (B.02 de 2024; la 8.1.1 es idéntica a la 1.4.9 del B.01). Incluye el tope de 400 solo bajo 2650, el tope K × n ≤ 700, el redondeo de 8.3.4, el piso de normas (un solo rival) y los certificados de norma de árbitro (1 por cada 25 o fracción).

Las preguntas del seminario reutilizadas (`js/arbitro-seminario/contenido.js`, temas «rating», «normas», «arbitros», «ingles») se recalcularon y dan lo mismo: 2377 vs 2428 → 2411; 2000 gana a 2300 → +17; K 40 con 20 partidas → 35; GM 5½/9 con 8 rivales de 2523 → 2492; 6/9 con Ra 2510 → 2635; suizo de 60 → 3 certificados. También el ejemplo del cuaderno del seminario (3/7 contra 1726…1740 más una incomparecencia → 1586).

## Correcciones a las fuentes del curso
- **Reglamento de Rating y Títulos (v2):**
  - El pre-registro «al menos 3 días antes» está incompleto: el art. 0.2 exige **30 días** si participa un jugador de más de 2700 o una jugadora de más de 2500 (se dice así en el texto).
  - «Jugador inactivo: 1 año (temporalmente 2 años)»: el art. 7.2.2 vigente dice un año; no encontré la excepción de «2 años» en el B.02 vigente, así que no la menciono.
  - «Al menos 9 rondas» para los torneos de títulos: el B.01 pide al menos **9 partidas** (art. 1.4.1), con excepciones; lo digo así.
  - La diapositiva de la diferencia de 400 no menciona la excepción de 2650 (art. 8.3.1 modificado desde el 1-oct-2025); se añadió.
  - «Arpard Elo» → Arpad Elo.
- **Títulos para árbitros (corregido):** está basado en el B.06.1 anterior (hasta el 28-feb-2026). Lo actualicé con el texto vigente desde el 1-mar-2026, leído completo en el Handbook: todos contra todos para AF con **8** con rating (antes «todos con rating al final o 10»); se añaden equipos y eliminatorios de 20 con rating (3.8.4, 3.8.5); 2.4.1-2.4.4 (conteo de jugadores, ritmo estándar, individual, no vale ser solo asistente); 2.8.1 (quién firma); 2.10 (normas sin superponerse, una por festival); 5.3.4 (solicitud solo con todos los torneos calificados); 5.4.3 (un año de AN o un torneo FIDE adicional); 5.5.3 (dos años de AF o tres torneos adicionales). «No pueden ser firmadas todas por el mismo Árbitro Principal» → hoy «por la misma persona que firma» (4.13.1). La regla de «al menos 2 federaciones» para un evento internacional de norma de AF ya no figura en 2026 (solo queda la de 3 federaciones para AI, art. 2.6.2).
- **English Terms (I1.1):** se conservó el vocabulario; ajusté algunas traducciones al uso de las Leyes en español: *default time* = «tiempo de espera (de incomparecencia)», *quickplay finish* = «final a caída de bandera (sin incremento)», *adjourn* = «aplazar». La nota sobre *rest room* / *restroom* (baño en el inglés de Estados Unidos) es mía.

## Lo que no pude comprobar o es interpretación
- **Redondeo de p en el rating inicial:** el B.02 no lo dice; usé dos decimales, como el B.01 (art. 1.4.9) y como el N.º 9. En los ejemplos (0,5556; 0,2857; 0,7857; 0,4444) no hay ambigüedad de medio punto.
- **Resolución del Consejo FIDE sobre ritmos más cortos (60′+30″ y 45′+30″):** solo digo que el art. 1.1 la enlaza y que se revise la versión vigente; no doy sus condiciones ni su fecha (coherente con los N.º 9 y 18, que anotan que podría cambiar en la Asamblea de diciembre de 2026). Por eso el ejemplo de ritmo corto usa 45′+15″, que esa resolución no cubre.
- **Rival sin rating que es el más bajo en una norma (práctica 3.6):** el art. 1.4.6 d dice que los rivales sin rating «no cubiertos por 1.4.6 b» cuentan como 1400; de ahí deduzco que, si es el más bajo, se sube al piso. Es lectura literal del texto, no una interpretación oficial que haya encontrado.
- **«Con el rating de la lista vigente se calculan todas las partidas del mes»:** se deduce de los arts. 7.1 y 8.3.2 c-d (cambio por periodo de rating); el reglamento no lo dice con esas palabras.
- **Numeración de las Leyes en el glosario** (3.7.3.3-3.7.3.5 promoción, 4.2.1, 4.3, 5.2.2, 6.7.1, 6.9, 7.5.1, 9.1.2.1, 9.2, 9.3, 9.6, 11.2, 11.3.2, 12.9): la tomé de las revistas ya revisadas del repositorio y de las fichas de la Aula; no volví a leer las Leyes completas en el Handbook para esta parte.
- **Módulo I1.1:** el PDF del curso dice «IA Certification Seminar»; lo cito como «módulo I1.1 English Terms de la formación de árbitros de la FIDE», sin afirmar en qué seminario exacto se usa.
- No incluí la Tabla de Títulos Directos ni el Reglamento de Rating de rápidas y blitz (ya están en el N.º 9 y no eran el objeto del curso); solo se mencionan.

## Coherencia con otras revistas
- El N.º 9 trae el resumen del B.02 y del B.01 con otros ejemplos (rating inicial 2158 y 1807; +4/+7; norma de GM 2601). Aquí los ejemplos son nuevos y no se repiten frases; las cifras y artículos coinciden.
- Los N.º 16 y 17 (rating performance) y el N.º 6 (normas de árbitro en rápidas) son coherentes con lo que se dice aquí.
- No se tocan temas de las otras partes (Leyes, Regulaciones generales, juego limpio, sistemas y desempates, examen). El TPR como desempate queda para la parte D.

## Fuentes (con versión)
- Material del curso (Google Drive): «Reglamento Rating y Títulos — CMS julio 2025 — corregido v2» (PDF); «Títulos para árbitros — corregido» (PDF); «I1.1 English Terms — corregido» (PDF).
- `js/arbitro-seminario/contenido.js`, temas «rating», «normas», «arbitros» e «ingles»; el cuaderno de práctica del curso (cuaderno-practica-af.html, no va en el repositorio) (glosario y ejemplo de rating inicial).
- FIDE Rating Regulations (Handbook B.02), aprobadas por el Consejo FIDE el 15-dic-2023, aplicadas desde el 1-mar-2024; art. 8.3.1 modificado con efecto desde el 1-oct-2025 (handbook.fide.com/chapter/B022024, leído completo).
- FIDE Title Regulations (Handbook B.01), aplicadas desde el 1-ene-2024, con su anexo de 7 a 19 rondas (handbook.fide.com/chapter/B012024, leído completo).
- FIDE Regulations for the Titles of Arbiters (Handbook B.06.1), vigentes desde el 1-mar-2026 (handbook.fide.com/chapter/B06012026, leído completo), comparadas con la versión vigente hasta el 28-feb-2026 (chapter/B0601).
- FIDE Laws of Chess, vigentes desde el 1-ene-2023 (artículos citados en el glosario).


## Parte F

# Parte F — Cuaderno de práctica y examen simulado (notas internas)

## Qué hay en la parte

- `f-cuerpo.html`: cinco secciones `page`:
  1. «Cómo es el examen del seminario AF y cómo prepararlo» (formato, 80 %, cómo estudiar, mapa de las Leyes) + Practica (5).
  2. «Casos de la sala de juego»: 16 casos (7 de Leyes con tablero, 2 de juego limpio/conducta/apelaciones, 4 de emparejamientos y desempates, 3 de rating y títulos) + Practica (5).
  3. «Examen simulado»: 40 preguntas de opción múltiple (Leyes 1-20, reglamentos y sistemas 21-32, rating y títulos 33-40), sin marcar la respuesta; un tablero (pregunta 6) + Practica (4).
  4. «Soluciones del examen simulado»: clave rápida, tabla con respuesta y explicación con artículo de cada pregunta, tabla de corrección (aciertos → nota, 2,5 puntos por pregunta, aprobado con 32) + Practica (4).
  5. «Soluciones de la práctica».
- `f-fichas.json`: 3 fichas (`r21-f-examen-leyes`, `r21-f-examen-reglamentos`, `r21-f-examen-rating-titulos`), las 40 preguntas del simulado repartidas 20/12/8 con el mismo orden de opciones que la revista, y 5 casos (`r21-f-enroque-a-medias`, `r21-f-caballo-clavado`, `r21-f-repeticion-enroque`, `r21-f-sospecha-al-oido`, `r21-f-norma-gm`), todos con `ritmo: null`.
- La respuesta correcta del simulado está repartida 10/10/10/10 entre a, b, c y d.
- El cuerpo y las fichas salen de un generador propio (un banco de preguntas y una plantilla); si hay que tocar una pregunta, que coincidan revista y ficha.

## Comprobaciones hechas

- Los 7 FEN del cuerpo pasan chess.js 0.10.3 (legales, el bando que no mueve no está en jaque). Comprobado además:
  - Caso 1: 0-0 legal y …Cg4 legal desde f6.
  - Caso 3: 42.Cxb4 ilegal (clavada) y 42.Dxb4 legal; es la única captura del alfil.
  - Caso 4: 1.a8=D es ahogado; 1.a8=C+ es jaque y no ahoga.
  - Caso 5: 50.Dc7 es ahogado.
  - Caso 6: 35…dxe1=D es legal y no es jaque (el alfil de f1 tapa); con el FEN que puse primero (sin el alfil) era mate y lo cambié.
  - Caso 7: la secuencia 6.Axf7+ Rd8 7.Ab3 Re8 8.Af7+ Rd8 9.Ab3 Re8 10.Af7+ es legal; tras 6…Rd8 el negro pierde el enroque, así que solo hay dos repeticiones.
  - Pregunta 6: las jugadas de rey legales son Re2, Rf1 y 0-0 (Rd1 y Rd2 atacadas).
- Cálculos con script: Buchholz 73, BH-C1 67,5 y SB 53,5 (caso 13); BH-C1 33,5 (pregunta 31); rating 2377 → 2411 (caso 14), 2150 → 2176 (pregunta 33), +17 (pregunta 36), K = 35 y K = 28; norma de GM del caso 15 comprobada con `js/normas-titulo.js` (promedio 2510 con el piso, Rp 2635, composición válida); rival mínimo 2492 (pregunta 38); tablas Berger de 6 y 8 comprobadas (todas las parejas una vez); en la de 8, los números 4, 5 y 6 se enfrentan en las rondas 1 a 3.
- Tabla 8.1.2 (D → PD) y 8.1.1 (p → dp) tomadas de la revista N.º 9 y de `js/normas-titulo.js`.

## Correcciones a la fuente (examen del 215.º seminario, enero de 2026, y su versión corregida)

- Las preguntas están reescritas; no se copió ningún enunciado.
- **Nombres reales**: el examen usaba jugadores y jugadoras reales (preguntas 23, 24, 28, 29 y 34). En la revista todos los nombres son inventados; los ratings y resultados se conservaron para que los cálculos sean los mismos. La pregunta 23 (un caso real de expulsión) no se usó.
- **P-25 (rival mínimo para la norma)**: la clave aceptaba 2492 o 2496 «si se justifica». Como el Reglamento de Títulos redondea el promedio al entero (art. 1.4.7), la respuesta es 2492; 2496 queda como distractor.
- **P-26 (última norma de AF)**: la clave decía que la excepción de puros suizos era un evento de al menos 100 jugadores «de al menos dos federaciones», 30 % con rating y 7 rondas. En el B.06.1 vigente (arts. 2.5 y 2.5.1, según la parte de títulos de árbitros de esta misma revista) la condición es un suizo internacional con al menos 100 jugadores, 30 % con rating y 7 rondas; no repetí el número de federaciones.
- **P-21 (8 jugadoras, tres compatriotas)**: la respuesta (números 4, 5 y 6) es correcta y se comprobó; no reproduje la parte del «orden de elección del número», que no pude comprobar en el Anexo de C.05.
- **P-11b y P-17A**: la idea de que dos faltas en una misma acción (dos manos y peón sin cambiar) cuentan como **una** jugada ilegal es el criterio del examen y del curso; las Leyes no lo dicen con esas palabras (7.5.2, 7.5.4 y 7.5.5). Lo presento como decisión del caso, no como texto literal del artículo.
- No usé P-14 (posición muerta con captura al paso) ni P-30 (ronda 3 de un suizo con flotantes) porque no tenía los diagramas ni la tabla completa para comprobarlos.

## Lo que no pude comprobar en el texto oficial (dicho con prudencia o con el número usado en otras revistas)

- Numeración exacta de algunos artículos de las Leyes que no tenía delante: 4.2.1 (compongo), 3.9 (el rey propio no puede quedar en jaque), 6.8 (cuándo se considera caída la bandera), 12.2.4 (proteger a los jugadores de molestias, citado así en la revista N.º 10), 12.7 (expulsar del recinto, citado en la parte A), 7.3 (colores invertidos, citado así en otros materiales del sitio), 9.5 (reclamación incorrecta). Las definiciones de rápidas y relámpago se citan como Apéndices A.1 y B.1.
- Apelaciones: cito el art. 11.10 y las reglas del comité de apelaciones (Handbook C.11) sin plazo ni cuota, porque los fijan las bases.
- Suizo: el descanso de la ronda 1 para el último de la lista y los colores alternados mesa por mesa se citan como C.04.1 y C.04.3 (2026) sin número de artículo; la preferencia de color, como C.04.3 art. 1.7 (número tomado de la parte del sistema suizo de esta revista).
- Fair Play Regulations: arts. 3.1.1, 3.2.3, 3.2.5 y 3.2.9 tomados de la revista N.º 18.
- B.06.1 (2026): arts. 2.4.1, 2.5, 2.5.1, 2.7, 3.7, 3.8, 3.8.1, 5.3.1, 5.3.2 y 5.4.3 tomados de las revistas N.º 6 y 7, de `docs/decisiones/juegos-y-torneos.md` y de la parte de títulos de árbitros de este número; no los leí en el Handbook.
- El formato del examen (35 a 40 preguntas de desarrollo que suman 100 puntos, de 1 a 7 puntos cada una) describe el examen del 215.º seminario; otros seminarios pueden variar. No di duración del examen real ni si se permite consultar: el texto dice «cuando el seminario lo permita».

## Fuentes usadas

- FIDE Laws of Chess, aprobadas el 07/08/2022, en vigor desde el 01/01/2023 (vigentes en noviembre de 2026).
- C.04.1, C.04.2 y C.04.3 (sistema holandés), aplicables desde el 01/02/2026.
- C.05 FIDE General Regulations for Competitions, Anexos 1 (Berger) y 2 (Varma).
- C.07 Play-off and Tie-Break Regulations, aplicables desde el 01/03/2026 (arts. 4.1, 4.1.1, 4.2, 8, 8.1, 9.1, 14.1).
- C.11 reglas del comité de apelaciones (citado sin cifras).
- B.02 FIDE Rating Regulations, aplicadas desde el 01/03/2024 (arts. 6, 8.1.1, 8.1.2, 8.3, 8.3.3).
- B.01 FIDE Title Regulations, aplicadas desde el 01/01/2024 (arts. 1.4.1 a 1.4.9).
- B.06.1 Regulations for the Titles of Arbiters, vigentes desde el 01/03/2026.
- FIDE Fair Play Regulations (aplicadas desde el 18/11/2024).
- Examen del 215.º Seminario de Árbitro FIDE (9-12 de enero de 2026) con respuestas corregidas, y su versión docx corregida.
- Cuaderno de práctica del curso (`_fuente-cuaderno.html`, módulos y banco POOL) y `js/arbitro-seminario/contenido.js` (banco `examen` y preguntas por tema).
