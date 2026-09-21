-- Se probaron DOS formas de guardar el enlace de videollamada del profesor y
-- se deja una: la tabla `profesor_videollamada`. Esta quita la otra.
--
-- `profiles.enlace_llamada` (migración profiles_enlace_llamada, del mismo día)
-- resolvía lo mismo con una columna, y por eso no se queda: la RLS es por FILA
-- y no por columna, así que ahí el enlace le llega al alumno SIEMPRE —
-- `profiles_select` le deja ver la fila entera de cualquiera de sus profesores—
-- y el «solo con la clase abierta» quedaría dibujado únicamente por la
-- pantalla, que se salta desde la consola. En la tabla aparte, esa condición
-- es la política de select, o sea que sin clase el dato ni siquiera viaja.
-- De paso, `protect_profiles_identity_columns()` no la protegía, así que
-- cualquiera podía escribir la suya.
--
-- Se quita ahora y no «algún día»: dos sitios donde poner el mismo enlace son
-- dos botones, y el día que alguien escriba en el que no se lee, el fallo es
-- callado — se guarda, no da ningún error y el alumno nunca ve la llamada.
-- Hoy la columna está VACÍA en los 107 perfiles y no la lee ni la escribe
-- ninguna página, así que no se pierde nada.

alter table public.profiles drop constraint if exists profiles_enlace_llamada_es_https;

alter table public.profiles drop column if exists enlace_llamada;