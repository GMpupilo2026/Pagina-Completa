-- La libreta de torneos (1 de 3): lo que se le suma a partidas_torneo.
--
-- - ronda: la ronda del torneo, si la anota (la libreta las ordena).
-- - comentarios: lo que el alumno pensaba en sus jugadas, por media jugada
--   ({"6": "tenía miedo de…"}). Lo escribe él; lo lee su profesor.
-- - preparacion: la foto de cómo le fue con lo que había preparado («Prepárate
--   tú» o el plan del profe): hasta dónde siguió la línea y quién se salió. Se
--   guarda porque el plan propio vive solo en su navegador (como un acta).
-- - errores / avisada_at: cuántos errores encontró el motor al revisarla y
--   cuándo se le avisó al profesor (una sola vez, ver
--   avisar_partida_torneo()).
-- Ver «Mi libreta de torneos» en docs/decisiones/entrenamiento.md.
alter table public.partidas_torneo
  add column ronda smallint check (ronda between 1 and 30),
  add column comentarios jsonb not null default '{}'::jsonb
    check (jsonb_typeof(comentarios) = 'object' and octet_length(comentarios::text) <= 20000),
  add column preparacion jsonb
    check (preparacion is null or (jsonb_typeof(preparacion) = 'object' and octet_length(preparacion::text) <= 4000)),
  add column errores smallint check (errores between 0 and 300),
  add column avisada_at timestamptz;

-- Comentar y corregir la ronda o el torneo: solo el alumno, solo lo suyo. Las
-- jugadas no se editan (el permiso es por columna, en la parte 3).
create policy partidas_torneo_corrige on public.partidas_torneo for update to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));