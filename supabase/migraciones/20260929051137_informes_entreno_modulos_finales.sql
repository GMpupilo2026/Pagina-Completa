-- Informes: los Finales contra la máquina, que el profesor no veía.
--
-- entreno/finales.html escribe una fila en training_progress por cada final
-- ganado o salvado (activity = 'finales', detail.final_id), pero ninguna función
-- de Informes la contaba: el alumno jugaba Philidor y Lucena contra el motor y
-- el profesor no veía ningún número. Se suma la columna `finales` (finales
-- distintos logrados) a informes_entreno_modulos(), la función de los módulos
-- que no cuenta informes_resumen_alumnos().
--
-- Cambiar lo que devuelve una función obliga a borrarla y volver a crearla, y
-- al borrarla se pierden los permisos: por eso van de nuevo al final. Nada más
-- la usa (js/informes.js), y es SECURITY INVOKER como antes: cada quien recibe
-- lo que la RLS de training_progress y training_state le deja ver.
drop function if exists public.informes_entreno_modulos();
create or replace function public.informes_entreno_modulos()
returns table (
  student_id uuid,
  visualizacion integer,
  temas integer,
  con_como_salio integer,
  limpios integer,
  tipos_ejercicios integer,
  tipos_estrellas integer,
  aperturas_empezadas integer,
  aperturas_firmes integer,
  precision_rondas integer,
  precision_ultima integer,
  precision_fecha timestamptz,
  finales integer
)
language sql
stable
security invoker
set search_path = public
as $$
with alumnos as (
  select p.id from public.profiles p where p.role = 'alumno'
),
progreso as (
  select tp.student_id,
    count(distinct tp.detail->>'puzzle_id')
      filter (where tp.activity = 'visualizacion')::int as visualizacion,
    count(distinct tp.detail->>'puzzle_id')
      filter (where tp.activity = 'temas')::int as temas,
    count(distinct tp.detail->>'puzzle_id')
      filter (where tp.detail ? 'limpio')::int as con_como_salio,
    count(distinct tp.detail->>'puzzle_id')
      filter (where tp.detail->>'limpio' = 'true')::int as limpios
  from public.training_progress tp
  join alumnos a on a.id = tp.student_id
  where tp.activity in ('visualizacion', 'temas', 'tactica')
    and coalesce(tp.detail->>'puzzle_id', '') <> ''
  group by tp.student_id
),
espejo as materialized (
  select ts.student_id, ts.key, public.json_seguro(ts.value->>'raw') as v
  from public.training_state ts
  join alumnos a on a.id = ts.student_id
  where ts.key in ('tipos_estrellas_v1', 'aperturas_srs_v1', 'precision_posicional_historial_v1')
),
objetos as materialized (
  select student_id, key, v from espejo where jsonb_typeof(v) = 'object'
),
listas as materialized (
  select student_id, key, v from espejo where jsonb_typeof(v) = 'array'
),
tipos as (
  select o.student_id,
         count(*) filter (where (case when jsonb_typeof(x.value) = 'number' then (x.value #>> '{}')::numeric end) > 0)::int as ejercicios,
         coalesce(sum(case when jsonb_typeof(x.value) = 'number' then (x.value #>> '{}')::numeric end), 0)::int as estrellas
  from objetos o, jsonb_each(o.v) x
  where o.key = 'tipos_estrellas_v1'
  group by o.student_id
),
aperturas as (
  select o.student_id,
         count(*) filter (where (case when jsonb_typeof(x.value) = 'object' then x.value->>'ultimo' end) is not null)::int as empezadas,
         count(*) filter (where (case when jsonb_typeof(x.value) = 'object' then x.value->>'ultimo' end) is not null
                            and (case when jsonb_typeof(x.value->'intervalo') = 'number' then (x.value->>'intervalo')::numeric end) >= 21)::int as firmes
  from objetos o, jsonb_each(o.v) x
  where o.key = 'aperturas_srs_v1'
  group by o.student_id
),
-- Finales contra la máquina: cada final ganado o salvado escribe UNA fila
-- (activity = 'finales', detail.final_id); se cuentan los distintos.
fin as (
  select tp.student_id, count(distinct tp.detail->>'final_id')::int as finales
  from public.training_progress tp
  join alumnos a on a.id = tp.student_id
  where tp.activity = 'finales' and coalesce(tp.detail->>'final_id', '') <> ''
  group by tp.student_id
),
precision_pp as (
  select e.student_id,
         jsonb_array_length(e.v)::int as rondas,
         case when jsonb_typeof(e.v->0->'porcentaje') = 'number' then round((e.v->0->>'porcentaje')::numeric)::int end as ultima,
         public.fecha_segura(e.v->0->>'fecha') as fecha
  from listas e
  where e.key = 'precision_posicional_historial_v1' and e.v <> '[]'::jsonb
)
select a.id,
       coalesce(p.visualizacion, 0), coalesce(p.temas, 0), coalesce(p.con_como_salio, 0), coalesce(p.limpios, 0),
       coalesce(t.ejercicios, 0), coalesce(t.estrellas, 0),
       coalesce(ap.empezadas, 0), coalesce(ap.firmes, 0),
       coalesce(pp.rondas, 0), pp.ultima, pp.fecha,
       coalesce(f.finales, 0)
from alumnos a
left join progreso p on p.student_id = a.id
left join tipos t on t.student_id = a.id
left join aperturas ap on ap.student_id = a.id
left join precision_pp pp on pp.student_id = a.id
left join fin f on f.student_id = a.id
order by a.id;
$$;
revoke execute on function public.informes_entreno_modulos() from public, anon;
grant execute on function public.informes_entreno_modulos() to authenticated;