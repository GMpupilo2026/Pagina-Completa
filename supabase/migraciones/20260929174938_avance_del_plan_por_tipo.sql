-- El avance del plan, por Tipo de entrenamiento. El plan del diagnóstico ya
-- mandaba a tipos concretos («Tipos de entrenamiento: La balanza» →
-- entreno/tipos.html#balanza), pero no se contaba nada ahí: todo Tipos caía en
-- 'actividad:tipos' y la página no le pedía esa clave a ningún recurso. Ahora
-- cada tipo es 'tipo:<id>' (detail.category), que es lo que arma
-- PlanEntrenamiento.claveDeAvance para ese enlace. Nadie leía 'actividad:tipos'.
-- El resto no cambia.
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
           when tp.activity = 'tipos' and coalesce(tp.detail->>'category', '') <> '' then 'tipo:' || (tp.detail->>'category')
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