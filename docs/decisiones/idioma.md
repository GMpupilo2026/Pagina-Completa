# Cómo se escribe

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: el español del sitio y el verificador de voseo.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

## Cómo se escribe en el sitio

El español del sitio es el de acá: latinoamericano, costarricense. Se tutea
—**tuteo, no voseo**: "puedes", no "podés"; "juega", no "jugá"— y tampoco
"vosotros". Se dice computadora y celular (no ordenador ni móvil), y los
términos de ajedrez van en el nombre que se usa en la región —tenedor,
enfilada, clavada, mate de la coz, mate del pasillo—, con el término en inglés
entre paréntesis solo cuando es el que el alumno va a encontrar buscando en
internet (zwischenzug, smothered mate). Nada de traducciones calcadas del
inglés ni de giros peninsulares.

### «Tenedor», nunca «horquilla»

Pedido del dueño (octubre de 2026): el ataque de una pieza a dos a la vez se
llama **tenedor** en todo el sitio y en todo lo que se escriba después —libros,
cursos, ejercicios, artículos, informes, la IA de «Mejorar informe»—. Primero
se cambió en el cuento de los trucos de Peonita y después en todo lo demás:
unas 1.850 apariciones de una vez, con un script que ajusta el género («la
horquilla» → «el tenedor», «una horquilla preparada» → «un tenedor
preparado», «de la horquilla» → «del tenedor») y una revisión a mano de lo que
un script no ve (pronombres: «se llega a ella» → «se llega a él»; el verbo
«horquillar»; el índice alfabético de las fichas, que ahora pone «Tenedor, el»
en la T).

- **Los identificadores no cambiaron**, porque no se ven y algunos los guarda
  la base: el tema `horquilla` de los errores y de la preparación, `tac_horquilla`
  del diagnóstico, el motivo `horquilla`, la ficha `?ficha=horquilla`, la
  dirección `articulos/horquillas-de-caballo.html` y los archivos de la lección
  2 de Estrategia y táctica (`02-horquillas-…pptx` y `-ejercicios.pdf`). Solo
  el cuadernillo de esa lección cambió de nombre, porque el generador lo nombra
  por el título.
- **`python3 herramientas/verificar-vocabulario.py` falla si «horquilla»
  vuelve** al texto que se ve (el mismo que lee `verificar-voseo.py`, más las
  presentaciones), y deja pasar esos identificadores. Una palabra cambiada así
  no da ningún error si un generador o un texto importado la vuelve a meter.
- Lo generado se regeneró con su generador (los PDF de los libros y los
  cuadernillos). Lo que no tiene generador se corrigió en el propio archivo:
  las presentaciones (`.pptx`), los PDF de ejercicios de las lecciones (el
  texto va en claro) y uno de Desequilibrios de material hecho con Chrome, al
  que se le cambiaron los glifos de la única palabra. Los `banco.js` de los
  libros dicen «GENERADO… no se edita a mano», pero su generador necesita la
  base de Lichess y Stockfish: se les cambió la palabra igual que a la fuente,
  para que vuelvan a salir iguales la próxima vez que se generen.

**`python3 herramientas/verificar-voseo.py` revisa que no se cuele voseo** y
falla si encuentra; con `--arreglar` lo convierte. Al escribir texto nuevo o
importar contenido, correrlo. Con el contenido de septiembre entraron unas
1.900 formas de voseo y se colaron hasta dentro de los datos estructurados que
lee Google.

- **No es quitar la tilde**: el imperativo de tuteo cambia la raíz en muchos
  verbos ("pensá" es *piensa*, "jugá" es *juega*, "hacé" es *haz*, "volvé" es
  *vuelve*, "elegí" es *elige*), y con el pronombre pegado pasa al revés — el
  voseo no lleva tilde ("dejalo") y el tuteo sí ("déjalo"). Por eso la
  conversión es una tabla escrita verbo por verbo dentro del script, no una
  regla.
- **La tabla se completa cuando algo se escapa.** «Agregá» no estaba y llevaba
  meses dentro de `informes.html` sin que el verificador dijera nada: al
  corregir el texto se sumó el verbo, o el siguiente entra por la misma puerta.
- Lo que **no** es voseo y por eso está en la lista blanca: los futuros
  ("quedará", "tendrás", "podrá"), los pretéritos de primera persona
  ("empecé", "aprendí", "entendí", "tomé") y los nombres propios ("Elistá",
  "Andrés", "Valdés"). Si aparece una palabra nueva que el script marca mal,
  se agrega ahí.
- "vos" se resuelve por contexto: con preposición delante es *ti* ("un lugar
  para ti"), si no es *tú* ("busca tú mismo").
- **El barrido mira también las Edge Functions** (`supabase/functions/**/*.ts`),
  no solo el HTML, el JS y el CSS. Esos archivos escriben **correo que sale a
  las familias**, o sea el texto del sitio que menos se revisa y el único que no
  se puede corregir después de mandado: el correo de invitación de
  `admin-manage-users` decía «elegí un plan» y ahí lleva desde que se escribió,
  porque esa función vivía solo desplegada y el verificador solo leía el sitio.

  **`admin-manage-users` entró al repositorio por eso**, bajada tal cual del
  despliegue y sin tocarle nada más que esa palabra. Antes cambiarle una línea
  era bajarla, editarla a ciegas y volver a subirla —la misma decisión que ya se
  había tomado con `cobros-recordatorios` e `informes-encargados`—. Ya quedó
  desplegada (versión 10), junto con el rechazo de bajar a alumno a quien
  todavía tiene alumnos.

### Y las respuestas de Claude también van en español

**Todo lo que Claude escriba en la conversación va en español**, no solo el
texto que termina en el sitio: las explicaciones, los resúmenes de lo que hizo,
las preguntas, los mensajes de commit y los cuerpos de los PR. El dueño del
repositorio trabaja en español y contestarle en inglés lo obliga a traducir
mentalmente cada respuesta.

Y va con **el mismo español de arriba** —tuteo, latinoamericano, sin voseo y sin
giros peninsulares— por una razón práctica, no de estilo: buena parte de lo que
se escribe en la conversación termina copiado dentro del sitio (un aviso, el
texto de un botón, la descripción de una lección). Si en el chat se escribe
"podés" y en el sitio "puedes", el voseo entra por esa puerta — que es
exactamente por donde entraron las 1.900 formas de septiembre.

Los nombres de archivo, las clases de CSS, los identificadores y los comandos
se quedan como están: son código, no texto.
