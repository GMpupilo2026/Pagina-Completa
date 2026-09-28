-- El plan del diagnóstico dice qué hacer cada semana, pero no si se hizo: era
-- texto quieto. Esto cuenta, para UN alumno y desde una fecha (la del
-- diagnóstico del que salió el plan), cuántas cosas distintas hizo en cada
-- lugar al que manda un recurso del plan.
--
-- La clave es lo que la página arma a partir del enlace del recurso
-- (PlanEntrenamiento.claveDeAvance):
--   tema:<clave>        Ejercicios por tema y Táctica (detail.theme)
--   mates:<categoría>   Mates (detail.category: mate1, mate2, mate3)
--   curso:<slug>        una lección de un curso (detail.curso)
--   actividad:<nombre>  todo lo demás, por actividad (practicar, aprender,
--                       coordenadas, aperturas, 4x4, visualizacion…)
-- «Distintas»: un mismo ejercicio, serie, lección o línea repetido cuenta una
-- vez; lo que no trae id (Coordenadas, Concentración) cuenta cada ronda.
--
-- SECURITY INVOKER: la RLS de training_progress decide. El alumno solo recibe
-- lo suyo; el profesor, de sus alumnos; preguntar por otro da cero filas, no un
-- error. La cuenta se hace acá y no en el navegador: un alumno activo pasa de
-- mil filas en un mes, y PostgREST corta a mil sin avisar.
create or replace function public.avance_del_plan(p_alumno uuid, p_desde timestamptz)
returns table (clave text, hechos integer)
language sql
stable
security invoker
set search_path = public
as $$
select q.clave, count(distinct q.hecho)::int
from (
  select case
           when tp.activity in ('temas', 'tactica') and coalesce(tp.detail->>'theme', '') <> '' then 'tema:' || (tp.detail->>'theme')
           when tp.activity = 'mates' and coalesce(tp.detail->>'category', '') <> '' then 'mates:' || (tp.detail->>'category')
           when tp.activity = 'curso' and coalesce(tp.detail->>'curso', '') <> '' then 'curso:' || (tp.detail->>'curso')
           else 'actividad:' || tp.activity
         end as clave,
         coalesce(tp.detail->>'puzzle_id', tp.detail->>'set_id', tp.detail->>'lesson_id',
                  tp.detail->>'linea_id', tp.detail->>'leccion', tp.id::text) as hecho
  from public.training_progress tp
  where tp.student_id = p_alumno
    and tp.created_at >= coalesce(p_desde, '-infinity'::timestamptz)
) q
group by q.clave
order by q.clave;
$$;
revoke execute on function public.avance_del_plan(uuid, timestamptz) from public, anon;
grant execute on function public.avance_del_plan(uuid, timestamptz) to authenticated;
