-- «Tus propios errores» deja los ejercicios de cada alumno en training_state (clave errores_propios_v1, value = {raw: "<json>"}, un objeto de ejercicios por id con su `tema`). Esto los suma por tema para la vista de grupo de Informes: cuántos errores de cada tema y en cuántos alumnos. SECURITY INVOKER: training_state se lee con su RLS de siempre (cada profesor, sus alumnos; administración, todos; quien supervisa, los suyos), así que no abre nada nuevo. p_alumnos acota al grupo que se está mirando; null = todos los que se ven. Un raw que no sea JSON (lo escribe el navegador del alumno) se salta: interno.jsonb_o_nulo.
create or replace function interno.jsonb_o_nulo(p text)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  return p::jsonb;
exception when others then
  return null;
end;
$$;

revoke all on function interno.jsonb_o_nulo(text) from public, anon;
grant execute on function interno.jsonb_o_nulo(text) to authenticated, service_role;

create or replace function public.errores_temas_del_grupo(p_alumnos uuid[] default null)
returns table (tema text, errores integer, alumnos integer)
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
    select f.student_id, e.value->>'tema' as tema
      from filas f
      cross join lateral jsonb_each(case when jsonb_typeof(f.j) = 'object' then f.j else '{}'::jsonb end) e
     where jsonb_typeof(e.value) = 'object'
       and e.value ? 'id' and e.value ? 'fen'
  )
  select ej.tema, count(*)::int as errores, count(distinct ej.student_id)::int as alumnos
    from ej
   where ej.tema ~ '^[a-z-]{2,20}$'
   group by ej.tema
   order by 2 desc, 3 desc, 1
   limit 12;
$$;

revoke execute on function public.errores_temas_del_grupo(uuid[]) from public, anon;
grant execute on function public.errores_temas_del_grupo(uuid[]) to authenticated, service_role;