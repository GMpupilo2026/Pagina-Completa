-- Las fotos de "quién ve qué" antes y después del cambio ya cumplieron: se
-- compararon tabla por tabla para las tres identidades (administración,
-- profesora sin alumnos y alumno) y el único cambio fue el que se buscaba.
drop table if exists public._foto_rls;
drop function if exists public._foto_actual();