-- «Tu mes en ajedrez» (logros.html y el aviso de los primeros días del mes en
-- «Hoy te toca»): lo que el alumno entrenó en un mes, contra el anterior.
--
-- `p_mes` es cualquier día del mes que se pide (por omisión, el mes en curso);
-- los meses van en hora de Costa Rica, como la racha. Un día «activo» tiene 5
-- o más ejercicios, el mismo corte de progreso_dias_y_racha(), y `racha_mejor`
-- es la tirada más larga de días activos seguidos DENTRO del mes.
--
-- SECURITY INVOKER (por omisión): quién puede pedir el mes de quién lo decide
-- la RLS de training_progress. Solo lee las filas de dos meses de UN alumno.
create or replace function public.entreno_mi_mes(alumno uuid default auth.uid(), p_mes date default null)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with m as (
    select date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Costa_Rica')::date))::date as ini
  ),
  rango as (
    select m.ini, (m.ini + interval '1 month')::date as fin, (m.ini - interval '1 month')::date as ant from m
  ),
  filas as (
    select (tp.created_at at time zone 'America/Costa_Rica')::date as dia, tp.activity, tp.detail
    from public.training_progress tp, rango
    where tp.student_id = alumno
      and tp.created_at >= rango.ant::timestamp at time zone 'America/Costa_Rica'
      and tp.created_at <  rango.fin::timestamp at time zone 'America/Costa_Rica'
  ),
  mes as (select f.* from filas f, rango where f.dia >= rango.ini),
  dias as (select dia, count(*)::int n from mes group by dia),
  activos as (select dia, dia - (row_number() over (order by dia))::int grupo from dias where n >= 5)
  select jsonb_build_object(
    'mes', to_char((select ini from rango), 'YYYY-MM'),
    'ejercicios', (select count(*) from mes),
    'dias_con_algo', (select count(*) from dias),
    'dias_activos', (select count(*) from activos),
    'racha_mejor', coalesce((select max(c) from (select count(*)::int c from activos group by grupo) t), 0),
    'mejor_dia', (select jsonb_build_object('dia', dia, 'n', n) from dias order by n desc, dia limit 1),
    'con_como_salio', (select count(*) from mes where detail ? 'limpio'),
    'limpios', (select count(*) from mes where detail->>'limpio' = 'true'),
    'por_actividad', coalesce((select jsonb_object_agg(activity, n) from (select activity, count(*)::int n from mes group by activity) t), '{}'::jsonb),
    'anterior', (select count(*) from filas f, rango where f.dia < rango.ini)
  );
$$;
revoke execute on function public.entreno_mi_mes(uuid, date) from public, anon;
grant execute on function public.entreno_mi_mes(uuid, date) to authenticated;
