# Los modelos de IA propios (`herramientas/ia/`)

Verificador: `node herramientas/verificar-todo.js ia`.

Proyectos de machine learning que se entrenan con la actividad de la Academia.
Por ahora no corren en el sitio: miden si algo se puede predecir antes de
construirlo. Cada uno tiene su consulta de exportación (`*-exportar.sql`) y su
cuaderno de Jupyter (`*.ipynb`), que se abre también en Google Colab.

## Los datos para entrenar no salen de la máquina

Las exportaciones salen **anónimas** (sin id, nombre, correo ni fechas exactas),
pero siguen siendo de alumnos, muchos menores de edad, y con pocas columnas una
persona se puede volver a reconocer. Por eso hay tres reglas, y las revisa
`verificar-ia.js`, porque las tres se rompen sin dar ningún error:

- **El CSV va a `herramientas/ia/datos/`**, que está en `.gitignore`, o fuera
  del repositorio. Nada de esa carpeta puede estar en git: de git no se borra
  nada.
- **El cuaderno se commitea sin salidas.** Si alguien lo corre y lo commitea
  así, la tabla de `datos.head()` viaja adentro del `.ipynb`.
- **Cada exportación solo saca las columnas de su lista** (`COLUMNAS` en el
  verificador). Una columna nueva se agrega ahí a conciencia, después de pensar
  si dice quién es la persona.

`alumno` es un número que se sortea de nuevo en cada exportación (`md5` del id
con un `gen_random_uuid()`, no con `now()`, que se adivina): sirve solo para no
mezclar a la misma persona entre entrenar y probar.

Si un modelo llega al sitio, lo que haga va en la política de privacidad: la
Ley 8968 pide decir para qué se usan los datos (ver «Las páginas legales» en
`legal.md`).

## El aviso de abandono

`abandono-exportar.sql` + `abandono.ipynb`. Una fila por alumno y por lunes
(el «corte»): cómo venía las cuatro semanas antes y si después se calló tres
semanas: ni clase, ni ejercicios, ni una página vista (`class_attendance`,
`training_progress`, `platform_activity_log`).

- **Se cuenta por día de Costa Rica, juntado primero.** La primera versión
  miraba cada actividad para cada alumno y cada corte, y se pasaba del minuto
  del editor; juntar la actividad por día (`dias`) la dejó en segundos.
- **Un grupo que para no es un alumno que abandona.** En octubre de 2026 dos
  profesores dejaron de dar clase en la plataforma y sus grupos enteros
  aparecían como «callados» de golpe, alumnos que llevaban meses viniendo dos
  veces por semana. Por eso quien venía a clase solo cuenta si **alguno de sus
  profesores siguió dando clase** en esas tres semanas
  (`interno.profesores_de()`, nunca `profile_teachers`). Con eso la proporción
  de «se calló» quedó pareja de semana a semana (6 % a 20 %) en vez de saltar.
- **Las cuentas temporales quedan afuera**: se cierran solas en una fecha, y
  callarse ahí no es abandonar.
- **Antes del 11/9/2026 solo había asistencia a clase**: en los primeros cortes,
  «se calló» quiere decir «no vino a clase».

**Cómo le fue** (octubre de 2026: 1437 filas, 195 alumnos, 12 % se calló,
probado por alumno con `GroupKFold`): la regla «el que lleva más días sin venir»
ya da AUC 0,84; la regresión logística y el bosque aleatorio llegan a 0,88. De
cada 10 que el modelo marca con más riesgo, unos 6 se fueron de verdad. La
mejora sobre la regla es chica con siete semanas de datos: vale volver a
exportar y medir cada mes antes de construir el aviso en el panel. Si la
distancia no crece, la regla alcanza.

El aviso, si llega a hacerse, es para que el profe llame y pregunte cómo está
el alumno, nunca para cobrarle ni tratarlo distinto.
