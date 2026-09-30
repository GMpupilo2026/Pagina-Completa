-- El tipo más flojo de cada alumno: en qué Tipo de entrenamiento (Detective,
-- la balanza, Elige a tiempo…) le cuesta más resolver limpio. Es la misma
-- idea que informes_tema_mas_flojo(), para Tipos.
--
-- Cada ejercicio de Tipos se registra UNA vez, la primera que se resuelve
-- (activity 'tipos', desde #555), con sus estrellas y el tipo en
-- detail.category. Limpio es tres estrellas: sin error ni pista (o perfecto,
-- en Con lo justo y Fotografía). Se mira `estrellas` y no `limpio` porque las
-- filas anteriores a #559 no traen `limpio`, pero sí las estrellas.
--
-- Un tipo entra desde 5 ejercicios distintos: con menos, un solo tropiezo ya
-- lo pone en 0 %. Empate: el que tiene más ejercicios, y después el nombre.
--
-- SECURITY INVOKER: la RLS de training_progress decide quién ve a quién. Una
-- fila por alumno.
create or replace function public.informes_tipo_mas_flojo()
returns table (
  student_id uuid,
  tipo text,
  intentos integer,
  limpios integer,
  porcentaje integer
)
language sql
stable
security invoker
set search_path = public
as $$
with por_tipo as (
  select tp.student_id,
         tp.detail->>'category' as tipo,
         count(distinct tp.detail->>'puzzle_id')::int as intentos,
         count(distinct tp.detail->>'puzzle_id') filter (where tp.detail->>'estrellas' = '3')::int as limpios
  from public.training_progress tp
  where tp.activity = 'tipos'
    and tp.detail ? 'estrellas'
    and coalesce(tp.detail->>'category', '') <> ''
    and coalesce(tp.detail->>'puzzle_id', '') <> ''
  group by 1, 2
)
select distinct on (p.student_id)
       p.student_id, p.tipo, p.intentos, p.limpios,
       round(100.0 * p.limpios / p.intentos)::int
from por_tipo p
where p.intentos >= 5
order by p.student_id, p.limpios::numeric / p.intentos, p.intentos desc, p.tipo;
$$;
revoke execute on function public.informes_tipo_mas_flojo() from public, anon;
grant execute on function public.informes_tipo_mas_flojo() to authenticated;