# Cómo se escribe

Notas de diseño para Claude, sacadas del CLAUDE.md de la raíz: el español del sitio y el verificador de voseo.
El índice de todos los temas y las reglas que valen para todo el sitio
están en `CLAUDE.md`.

## Cómo se escribe en el sitio

El español del sitio es el de acá: latinoamericano, costarricense. Se tutea
—**tuteo, no voseo**: "puedes", no "podés"; "juega", no "jugá"— y tampoco
"vosotros". Se dice computadora y celular (no ordenador ni móvil), y los
términos de ajedrez van en el nombre que se usa en la región —horquilla,
enfilada, clavada, mate de la coz, mate del pasillo—, con el término en inglés
entre paréntesis solo cuando es el que el alumno va a encontrar buscando en
internet (zwischenzug, smothered mate). Nada de traducciones calcadas del
inglés ni de giros peninsulares.

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
