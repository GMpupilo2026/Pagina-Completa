-- El enlace de videollamada del profesor (Meet, Zoom, Teams, lo que use), para
-- ofrecérselo a sus alumnos en el panel junto a "Sesión en vivo". No hace
-- falta ninguna RLS nueva: profiles_update_own ya deja a cada quien editar su
-- propia fila, y protect_profiles_identity_columns() solo revierte columnas
-- que están listadas ahí a mano (role, email, is_admin, es_coordinador,
-- teacher_id, invitaciones_*) — esta no es una de ellas, así que un update
-- normal del navegador la deja pasar. Y para leerla, profiles_select ya deja
-- a un alumno ver la fila entera de CUALQUIERA de sus profesores
-- (es_mi_profesor(id)), así que no hace falta abrir nada nuevo tampoco.
ALTER TABLE public.profiles
  ADD COLUMN enlace_llamada text;

-- Si se guarda algo, que sea un enlace de verdad: un texto suelto ahí no da
-- ningún error hasta que un alumno aprieta el botón y no pasa absolutamente
-- nada, sin que nadie se entere de por qué.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_enlace_llamada_es_https
  CHECK (enlace_llamada IS NULL OR (length(enlace_llamada) <= 500 AND enlace_llamada ~* '^https://'));
