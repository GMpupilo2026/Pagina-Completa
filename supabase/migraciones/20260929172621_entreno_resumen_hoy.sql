-- El resumen del día en el hub de Entrenamiento: qué hizo hoy (por actividad)
-- y cuántos ejercicios salieron limpios de los que dicen cómo salieron. Hoy
-- es el día de Costa Rica, el mismo corte de progreso_dias_y_racha().
--
-- `limpios` y `con_como_salio` cuentan las filas que traen `limpio` (Temas,
-- Mates, Visualización, Finales, Tipos, Practicar, 4×4, Memoria): las demás
-- actividades no dicen cómo salió y no entran en esa cuenta.
--
-- SECURITY INVOKER (por omisión): la RLS de training_progress decide.
create or replace function public.entreno_resumen_hoy(alumno uuid default auth.uid())
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with hoy as (
    select tp.activity, tp.detail
    from public.training_progress tp
    where tp.student_id = alumno
      and (tp.created_at at time zone 'America/Costa_Rica')::date = (now() at time zone 'America/Costa_Rica')::date
  )
  select jsonb_build_object(
    'total', (select count(*) from hoy),
    'por_actividad', coalesce((select jsonb_object_agg(activity, n) from (select activity, count(*)::int n from hoy group by activity) t), '{}'::jsonb),
    'con_como_salio', (select count(*) from hoy where detail ? 'limpio'),
    'limpios', (select count(*) from hoy where detail->>'limpio' = 'true')
  );
$$;
revoke execute on function public.entreno_resumen_hoy(uuid) from public, anon;
grant execute on function public.entreno_resumen_hoy(uuid) to authenticated;