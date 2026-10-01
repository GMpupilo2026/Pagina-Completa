-- Las cuatro llaves foráneas sin índice que marcó el asesor de rendimiento
-- de Supabase (unindexed_foreign_keys). Sin índice, borrar una cuenta o un
-- cuestionario recorre la tabla entera para el ON DELETE (cascade / set null),
-- y cuestionario_intentos es una tabla de actividad: crece con cada intento.
-- Mismo criterio que el resto del esquema: cada llave foránea con el suyo.
create index if not exists cuestionario_intentos_alumno_id_fk
  on public.cuestionario_intentos (alumno_id);
create index if not exists cuestionario_intentos_cuestionario_id_fk
  on public.cuestionario_intentos (cuestionario_id);
create index if not exists curso_adjuntos_created_by_fk
  on public.curso_adjuntos (created_by);
create index if not exists curso_contenido_updated_by_fk
  on public.curso_contenido (updated_by);
