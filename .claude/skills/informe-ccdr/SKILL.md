---
name: informe-ccdr
description: Arma el informe técnico mensual de ajedrez para el CCDR San José (Comité Cantonal de Deportes y Recreación) en Word, con la guía del comité, a partir de una carpeta de Google Drive con asistencias, informe de la plataforma, lista de estudiantes, torneos de chess-results y fotos. Usar cuando pidan «el informe del CCDR», «el informe para el comité» o el informe mensual de entrenamiento de San José.
---

# El informe mensual para el CCDR San José

Quien lo pide (el entrenador, Óscar Angulo Cubero) deja cada mes en una carpeta
de Google Drive todo lo que hace falta y pasa el enlace. El resultado es un
Word con la estructura de la guía del comité, que se arma con
`herramientas/informe-ccdr.js` a partir de un JSON con los datos del mes. El
porqué de cada paso está en «El informe mensual para el CCDR San José»
(`docs/decisiones/informes.md`).

**Los datos del mes NUNCA van al repositorio**: son nombres, asistencia y
fotos de menores de edad. Todo se trabaja en la carpeta temporal (scratchpad) de la sesión.

## 1. Leer la carpeta de Drive

Con el conector de Google Drive (`search_files` con `parentId = '<id de la carpeta>'`,
y lo mismo para cada subcarpeta). Lo que suele traer:

| Qué | Cómo se lee |
|---|---|
| `Guía informe Ajedrez.docx`: la plantilla del comité | `read_file_content`. Si cambió respecto de las nueve preguntas de `informe-ccdr.js`, se ajusta el armador. |
| `estudiantes.csv`: los atletas (`Estudiante;Ejercicios`) | `download_file_content` → base64 → texto. Separador `;`, trae BOM. |
| `informe-<asistente>-AAAA-MM.csv`: el informe mensual de la plataforma | igual. Trae «Sus números del mes», «Clase por clase» y «Estudiante por estudiante». |
| Carpeta `Asistencia/`: un `.xlsx` de Google Meet por sesión | `read_file_content` (sale como texto). Solo los del mes del informe. |
| Doc `Torneos Jugados`: enlaces de chess-results | `read_file_content`. |
| Carpeta `Fotos/` | Ver el paso 4. |

## 2. Las asistencias de Meet

- Se cuentan las personas conectadas **sin el cuerpo técnico**: no cuentan la cuenta de
  Óscar Angulo Cubero ni la cuenta «Ajedrez» (la que abre la reunión). Si una persona aparece dos
  veces, cuenta una sola vez. Las filas de «Participantes de los grupos» (salas de trabajo) no
  suman asistentes.
- Los nombres de cuenta se juntan con un atleta de `estudiantes.csv` **solo cuando la
  coincidencia es clara** (apellidos iguales, o un apodo que en la lista corresponde a una sola persona:
  «Chris» → Christopher Lezcano, «Karissa_cg» → Karissa Cabezas Gutiérrez). Las cuentas que parecen
  de familiares van en «Otras cuentas», sin adivinar de quién son.
- Las clases en vivo de la plataforma (no son de Meet) salen de «Clase por clase» y «Estudiante por
  estudiante» del CSV de la plataforma.

## 3. Los torneos (chess-results)

La red de la sesión **no** llega a chess-results.com. Se piden desde la base con `pg_net`
(`execute_sql` en el proyecto AjedrezIntegral, `bgtijpimpcokxatxxbki`). Solo se LEE.

```sql
select net.http_get(url := 'https://s3.chess-results.com/tnr<NUM>.aspx',
  params := '{"lan":"2","art":"1","turdet":"YES","zeilen":"99999"}'::jsonb,
  timeout_milliseconds := 30000);
-- después: select content from net._http_response where id = <id>;
```

- Los parámetros van en `params`. Con `headers` (por ejemplo un User-Agent), chess-results contesta 400.
- `art=1`: la clasificación final. Las filas son `<tr class="CRng1|CRng2…">`. Si la tabla no trae
  la columna «Pts.», los puntos son el «Des 1».
- En un torneo por equipos, la misma página trae cada equipo como `N. Nombre (Elo medio…, Des 1: puntos de match)`
  en orden de clasificación, con sus jugadores y los puntos de cada uno.
- La fecha sale de `art=2&rd=1`: «1. Ronda el AAAA/MM/DD…».
- La sede no se puede leer (chess-results la esconde detrás de un botón). Va como `{"pend": "[completar]"}`,
  salvo que venga en el nombre del torneo.
- Se buscan los apellidos de los atletas de `estudiantes.csv`. Un torneo donde no jugó nadie del grupo se
  menciona en «Otros aspectos».

## 4. Las fotos

1. Bajar las candidatas con `download_file_content`. Una foto no cabe en la conversación, así que
   Claude Code guarda la respuesta en un `.txt` y avisa dónde quedó. Eso es lo que se busca: la foto **no**
   pasa por la conversación.
2. `python3 -I herramientas/informe-ccdr-fotos.py <carpeta de los .txt> <scratchpad>/fotos <scratchpad>/hoja.jpg`
   decodifica, endereza, achica a 1400 px y arma una hoja de miniaturas.
3. Mirar la hoja y escoger unas 8. **Se dejan fuera** las que traen la marca «Contenido generado por IA»,
   las de otro mes y las que no se sabe de qué actividad son. El pie dice qué se ve y la fecha; no se
   inventa quién es la persona ni el resultado.

## 5. El JSON y el Word

El JSON va en el scratchpad (`datos-AAAA-MM.json`). Las rutas de las fotos son relativas al JSON.

```json
{
  "periodo": "1 al 31 de octubre de 2026", "anio": 2026, "mes": "Octubre",
  "entrenador": "Óscar Angulo Cubero", "asistente": "Sebastián Mora Chavarría",
  "atletas": ["Nombre Apellido", "..."],
  "lugar": { "bloques": [{ "vi": [{ "b": "Clases presenciales: " }, "…"] }],
             "sesiones": [["Mar 01/10", "Virtual (Google Meet)", "6:00 – 7:00 p. m.", "Tema", "11"]],
             "nota": "…" },
  "macrociclo": [{ "p": "…" }, { "vi": [{ "b": "Técnica-táctica: " }, "…"] }],
  "pruebas": { "bloques": [ … ], "resultados": [["Evento (fecha)", "Sede", "Atleta o equipo", "Prueba / División", "Lugar – marca"]], "nota": "…" },
  "lesiones": [{ "p": [{ "pend": "No se reportaron lesiones ni problemas médicos durante el período." }] }],
  "forma": [ … ], "requerimientos": [ … ], "otros": [ … ],
  "anexoAsistencia": { "meet": [["Mar 01/10", ["Atleta", "…"], ["Otra cuenta"]]],
                       "plataformaTexto": "…", "plataforma": [["Atleta", 2]] },
  "fotos": [{ "archivo": "fotos/IMG-….jpg", "pie": "Qué se ve (fecha)" }]
}
```

Un bloque es `{"p": …}` (párrafo) o `{"vi": …}` (viñeta). Un texto es una lista de trozos: `"normal"`,
`{"b": "negrita"}`, `{"i": "cursiva"}` o `{"pend": "por confirmar"}`. **Todo lo que no sale de un dato
va en `pend`** (sale en amarillo): las lesiones, lo psicológico y lo físico si nadie lo dijo, los
requerimientos, las sedes que no se encontraron.

```bash
node herramientas/informe-ccdr.js <scratchpad>/datos-AAAA-MM.json <scratchpad>/Informe-tecnico-CCDR-San-Jose-<mes>-AAAA.docx
```

Después se convierte a PDF, se miran las páginas (que ninguna tabla se salga del cuadro) y se mandan
el Word y el PDF con `SendUserFile`. Al final, se dice qué quedó en amarillo.

## Lo que ya se sabe del grupo (confirmarlo cada mes)

- **Todos los sábados hay clase presencial en la Escuela Ricardo Jiménez, de 9:00 a. m. a 1:00 p. m.**,
  con una asistencia media de unas 34 personas (dato de septiembre de 2026). Va en «Lugar y horarios».
- Las sesiones virtuales son por Google Meet (martes, miércoles y algunos sábados) y por la plataforma
  Ajedrez Integral.
- En el informe de septiembre de 2026 se pidió **no incluir las tareas** («por este mes»): preguntar
  antes de volver a ponerlas.
- Todo en español de Costa Rica, con tuteo (ver `docs/decisiones/idioma.md`).
