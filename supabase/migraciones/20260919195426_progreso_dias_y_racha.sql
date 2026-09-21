
-- Logros y racha de días: la cuenta la hace la base, no el navegador (mismo
-- criterio que informes_resumen_alumnos). Un día "activo" es un día con 5 o
-- más ejercicios de CUALQUIER tipo en training_progress, agrupado por fecha
-- de Costa Rica (no UTC: alguien que entrena a las 11pm no puede perder el
-- día por currency del huso horario del servidor). La racha actual se corta
-- si el último día activo no es hoy ni ayer — con 20 min de holgura tampoco
-- hace falta acá, a diferencia de class_presence_log, porque el corte es por
-- DÍA calendario, no por minuto.
--
-- SECURITY INVOKER (por omisión): quién puede ver la racha de quién lo
-- decide la RLS de training_progress, igual que el resto de las funciones de
-- informes — un alumno solo puede pedir la suya (auth.uid()), un profesor o
-- administración puede pedir la de uno de sus alumnos.
create or replace function public.progreso_dias_y_racha(alumno uuid default auth.uid())
returns table (
  dias_activos int,
  racha_actual int,
  racha_record int,
  total_ejercicios int,
  tipos_distintos int,
  hoy_ejercicios int,
  primer_dia date,
  por_actividad jsonb
)
language sql
stable
set search_path to 'public'
as $$
  with mios as (
    select tp.activity, (tp.created_at at time zone 'America/Costa_Rica')::date as dia
    from public.training_progress tp
    where tp.student_id = alumno
  ),
  dias as (
    select dia, count(*)::int as n from mios group by dia
  ),
  activos as (
    select dia from dias where n >= 5
  ),
  marcados as (
    -- Islas de días consecutivos: restar el número de orden a la fecha da el
    -- mismo valor para todo un tramo sin huecos (gaps and islands de siempre).
    select dia, dia - (row_number() over (order by dia))::int as grupo
    from activos
  ),
  rachas as (
    select count(*)::int as largo, max(dia) as termina from marcados group by grupo
  ),
  hoy as (select (now() at time zone 'America/Costa_Rica')::date as d)
  select
    (select count(*) from activos)::int,
    coalesce((select largo from rachas, hoy where termina >= hoy.d - 1 order by termina desc limit 1), 0)::int,
    coalesce((select max(largo) from rachas), 0)::int,
    (select count(*) from mios)::int,
    (select count(distinct activity) from mios)::int,
    coalesce((select n from dias, hoy where dia = hoy.d), 0)::int,
    (select min(dia) from dias),
    coalesce((select jsonb_object_agg(activity, n) from (select activity, count(*)::int as n from mios group by activity) t), '{}'::jsonb);
$$;
