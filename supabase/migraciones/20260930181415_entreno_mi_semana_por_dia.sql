-- «Tu semana», también día por día: siete números (del más viejo a hoy) para
-- la gráfica de barras de «Hoy te toca». Es la misma cuenta que ya hacía la
-- función —las mismas filas, los mismos días de Costa Rica—, así que la
-- gráfica y el texto de al lado no pueden decir cosas distintas. Se agrega
-- una clave (`dias`) al jsonb: quien no la lee, sigue igual.
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
    'anterior_limpios', count(*) filter (where semana = 'anterior' and detail->>'limpio' = 'true'),
    'dias', (select jsonb_agg(jsonb_build_object('dia', g.dia, 'n', (select count(*) from marcadas m where m.dia = g.dia)) order by g.dia)
               from (select (hoy.d - k) as dia from hoy, generate_series(0, 6) k) g)
  )
  from marcadas;
$$;
revoke execute on function public.entreno_mi_semana(uuid) from public, anon;
grant execute on function public.entreno_mi_semana(uuid) to authenticated;
