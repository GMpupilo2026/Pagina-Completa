# Ajedrez Integral — notas para Claude

Sitio estático (HTML + Tailwind por CDN + JS sin framework) servido con
Cloudflare Workers Assets. `worker.js` solo sirve los archivos; `_headers` pone
las cabeceras de seguridad. No hay build ni tests: se edita el HTML/JS
directamente.

## Flujo de git

- Trabajar siempre en la rama de la sesión, nunca commitear en `main`.
- **Cuando el cambio esté terminado y verificado: empujar, abrir el PR contra
  `main` y mergearlo (squash), sin preguntar.** Es la preferencia del dueño del
  repo. El título del squash lleva el `(#NN)` del PR, como el resto del
  historial.
- Si el PR de la rama ya se mergeó, la siguiente tarea arranca de `main` al día.

## Cursos

Decisión vigente (revisada — antes fueron públicos del todo, ver historial de
`worker.js`/`CLAUDE.md` si hace falta el detalle): el **temario es público**
(portada, descripción y lista de lecciones de `cursos/<curso>.html`, visibles
sin sesión) pero el **contenido completo de las lecciones es solo para
alumnos de Academia**, a propósito, para motivar la inscripción.

- `cursos/<curso>.html`: portada y temario del curso — público, enlazado desde
  el menú del sitio y el pie de página.
- `cursos/protegido/<curso>.html`: el fragmento con las lecciones completas
  (texto, video, presentación y PDF) que inyecta `js/curso-acceso.js`. Exige
  sesión de Academia — lo hace cumplir `worker.js` en el servidor (cookie
  `curso_ok` firmada con HMAC, canjeada por la sesión de Supabase vía
  `/api/curso-auth-session`), no solo el JavaScript del navegador.
- `cursos/recursos/<curso>/`: presentaciones (.pptx) y hojas de ejercicios
  (.pdf) de las lecciones — mismo bloqueo que `cursos/protegido/`.
- El bloqueo depende de que la variable de entorno `COURSE_PASSWORD` exista en
  Cloudflare (es una llave interna para firmar la cookie, no una contraseña
  que vea ningún visitante); si se llegó a borrar cuando los cursos eran
  públicos, hay que volver a configurarla o el bloqueo deja fuera a todos,
  alumnos incluidos.

## Accesibilidad

Buena parte del sitio tiene "modo adaptado" (`js/adaptive-mode.js`) para alumnos
con discapacidad visual: al tocar textos, encabezados o contraste, mantener el
alto contraste y los encabezados que permiten saltar directo al contenido.
