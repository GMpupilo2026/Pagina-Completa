-- Los subgrupos que YO armé, con los ids de sus alumnos ya juntos.
--
-- Devuelve el arreglo de ids y no las filas sueltas porque quien la llama
-- (el filtro de Informes, el selector de Tareas y Exámenes) ya tiene cargada
-- la lista de sus alumnos: con los ids le basta para cruzar, sin pedirle a la
-- base una segunda consulta por cada subgrupo.
--
-- SECURITY INVOKER, como las de informes: quién puede ver qué lo sigue
-- decidiendo la RLS. El filtro por auth.uid() está escrito igual porque la
-- pregunta es "los MÍOS", no "los que puedo ver" — quien administra ve los de
-- todo el mundo y aquí eso sería una lista inservible.
create or replace function public.mis_subgrupos()
returns table (id uuid, nombre text, alumnos uuid[], cuantos integer)
language sql
stable
security invoker
set search_path to ''
as $$
  select s.id,
         s.nombre,
         coalesce(array_agg(sa.alumno_id order by sa.created_at)
                  filter (where sa.alumno_id is not null), '{}')::uuid[],
         count(sa.alumno_id)::integer
  from public.subgrupos s
  left join public.subgrupo_alumnos sa on sa.subgrupo_id = s.id
  where s.profesor_id = auth.uid()
  group by s.id, s.nombre
  order by s.nombre;
$$;

revoke execute on function public.mis_subgrupos() from anon;