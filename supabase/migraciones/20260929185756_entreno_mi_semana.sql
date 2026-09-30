-- «Tu semana» en el hub de Entrenamiento: los últimos 7 días contra los 7
-- anteriores (días de Costa Rica, hoy incluido), con cuántos ejercicios y
-- cuántos salieron limpios de los que dicen cómo salieron. El alumno veía el
-- día y la racha, pero no si estaba mejorando.
--
-- SECURITY INVOKER (por omisión): la RLS de training_progress decide.
create or replace function public.entreno_mi_semana(alumno uuid default auth.uid())
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with hoy as (select (now() at time zone 'America/Costa_Rica')::date as d),
  filas as (
    select (tp.created_at at time zone 'America/Costa_Rica')::date as dia, tp.detail
    from public.training_progress tp, hoy
    where tp.student_id = alumno
      and tp.created_at >= (hoy.d - 14)::timestamp at time zone 'America/Costa_Rica'
  ),
  marcadas as (
    select f.*, case when f.dia > hoy.d - 7 then 'esta' when f.dia > hoy.d - 14 then 'anterior' end as semana
    from filas f, hoy
  )
  select jsonb_build_object(
    'esta', count(*) filter (where semana = 'esta'),
    'esta_con', count(*) filter (where semana = 'esta' and detail ? 'limpio'),
    'esta_limpios', count(*) filter (where semana = 'esta' and detail->>'limpio' = 'true'),
    'anterior', count(*) filter (where semana = 'anterior'),
    'anterior_con', count(*) filter (where semana = 'anterior' and detail ? 'limpio'),
    'anterior_limpios', count(*) filter (where semana = 'anterior' and detail->>'limpio' = 'true')
  )
  from marcadas;
$$;
revoke execute on function public.entreno_mi_semana(uuid) from public, anon;
grant execute on function public.entreno_mi_semana(uuid) to authenticated;