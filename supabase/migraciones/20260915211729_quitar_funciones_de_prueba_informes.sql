-- Las dos copias ingenuas del algoritmo del navegador ya cumplieron: sirvieron
-- para comprobar, alumno por alumno, que informes_resumen_alumnos() da los
-- mismos números que daba la página, y que la unión de tramos de tiempo coincide
-- con el bucle que se hacía en JavaScript.
drop function if exists public._prueba_resumen_ingenuo();
drop function if exists public._prueba_minutos_bucle(timestamptz[], timestamptz[]);