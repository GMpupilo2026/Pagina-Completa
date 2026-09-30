-- «Tus propios errores» anota en cada ejercicio la celada del banco de Aperturas en que cayó el alumno (`celada`: el id de la línea de js/aperturas-lineas.js, o null). Esto las suma para la vista de grupo de Informes, igual que errores_temas_del_grupo con los temas: cuántas veces y cuántos alumnos cayeron en cada una, y la posición de una de esas veces (`fen`) para armar el plan de clase. SECURITY INVOKER: training_state se lee con su RLS de siempre, así que no abre nada nuevo. p_alumnos acota al grupo que se está mirando; null = todos los que se ven. El id y la posición los escribió el navegador del alumno: solo cuentan con forma de id y de FEN.
create or replace function public.errores_celadas_del_grupo(p_alumnos uuid[] default null)
returns table (linea text, errores integer, alumnos integer, fen text)
language sql
stable
security invoker
set search_path = public
as $$
  with filas as (
    select ts.student_id, interno.jsonb_o_nulo(ts.value->>'raw') as j
      from public.training_state ts
     where ts.key = 'errores_propios_v1'
       and (p_alumnos is null or ts.student_id = any(p_alumnos))
  ), ej as (
    select f.student_id, e.value->>'celada' as linea, e.value->>'fen' as fen
      from filas f
      cross join lateral jsonb_each(case when jsonb_typeof(f.j) = 'object' then f.j else '{}'::jsonb end) e
     where jsonb_typeof(e.value) = 'object'
       and e.value ? 'id'
  )
  select ej.linea, count(*)::int as errores, count(distinct ej.student_id)::int as alumnos, min(ej.fen) as fen
    from ej
   where ej.linea ~ '^[a-z0-9-]{2,40}$'
     and ej.fen ~ '^[1-8pnbrqkPNBRQK/]{15,71} [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d{1,3} \d{1,3}$'
   group by ej.linea
   order by 2 desc, 3 desc, 1
   limit 8;
$$;

revoke execute on function public.errores_celadas_del_grupo(uuid[]) from public, anon;
grant execute on function public.errores_celadas_del_grupo(uuid[]) to authenticated, service_role;