-- Los puntos del mes: lo que hizo cada alumno en las clases del mes en curso
-- (hora de Costa Rica), sumado de resumen_de_la_clase clase por clase. Los
-- PUNTOS no se calculan acá: la regla vive una sola vez en
-- js/puntos-clase.js, y esto devuelve los conteos que esa regla necesita.
--
-- SECURITY INVOKER: cada uno ve lo que su RLS le deja ver. El profe pasa su
-- id y ve a sus alumnos; el alumno pasa null y ve solo su fila (se filtra
-- además acá, porque en las partidas entre alumnos resumen_de_la_clase
-- puede traer también al compañero de la partida).
create or replace function public.resumen_del_mes(p_profesor uuid default null)
returns table (
  student_id uuid, nombre text, clases integer,
  respondidas integer, correctas integer, turnos_bien integer, turnos_casi integer,
  ganadas integer, tablas integer, partidas_ganadas integer, partidas_tablas integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select r.student_id, max(r.nombre), count(distinct cs.id)::int,
         sum(r.respondidas)::int, sum(r.correctas)::int, sum(r.turnos_bien)::int, sum(r.turnos_casi)::int,
         sum(r.ganadas)::int, sum(r.tablas)::int, sum(r.partidas_ganadas)::int, sum(r.partidas_tablas)::int
    from public.class_sessions cs
    cross join lateral public.resumen_de_la_clase(cs.id) r
   where cs.started_at >= (date_trunc('month', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica')
     and (p_profesor is null or cs.created_by = p_profesor)
     and (p_profesor is not null or r.student_id = (select auth.uid()))
   group by r.student_id;
$$;
revoke execute on function public.resumen_del_mes(uuid) from public, anon;
grant execute on function public.resumen_del_mes(uuid) to authenticated;
