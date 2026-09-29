-- resumen_del_mes: con el id de un profe, un alumno veía una fila que la RLS
-- le deja ver (en una partida entre alumnos, la del compañero), y otro profe
-- veía algo de una clase ajena. Cada fila es ahora de quien pregunta o de una
-- clase SUYA (la que dio él), además de lo que diga la RLS.
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
     and (r.student_id = (select auth.uid()) or cs.created_by = (select auth.uid()))
   group by r.student_id;
$$;
revoke execute on function public.resumen_del_mes(uuid) from public, anon;
grant execute on function public.resumen_del_mes(uuid) to authenticated;
