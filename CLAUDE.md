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

Los cursos son **públicos**: no hay contraseña, ni inicio de sesión, ni ninguna
otra restricción para ver las lecciones completas ni para descargar sus
presentaciones y PDF. Fue una decisión explícita — no volver a poner un bloqueo
salvo que se pida.

- `cursos/<curso>.html`: portada y temario del curso.
- `cursos/protegido/<curso>.html`: el fragmento con las lecciones completas que
  inyecta `js/curso-acceso.js`. El nombre de la carpeta es histórico (antes
  estaba bajo llave); hoy es contenido público como el resto.
- `cursos/recursos/<curso>/`: presentaciones (.pptx) y hojas de ejercicios
  (.pdf), descargables por cualquiera.

## Accesibilidad

Buena parte del sitio tiene "modo adaptado" (`js/adaptive-mode.js`) para alumnos
con discapacidad visual: al tocar textos, encabezados o contraste, mantener el
alto contraste y los encabezados que permiten saltar directo al contenido.
