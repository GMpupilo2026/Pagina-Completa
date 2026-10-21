-- Los profesores que estudian conmigo (o con alguien a quien yo veo), para
-- sumarlos a la lista de alumnos donde un profesor elige a quién mandarle una
-- tarea, un examen o un plan. Esas pantallas piden `role = 'alumno'` a la
-- tabla de perfiles y un profesor que también es alumno no salía. Ver «Un
-- profesor también puede ser alumno de otro» en docs/decisiones/permisos-y-roles.md.
--
-- SECURITY INVOKER: pasa por la RLS de profiles, así que ya viene acotada a lo
-- que quien llama puede ver; interno.profesor_alumno_mio() lo acota a los que
-- son sus alumnos (a todos los que estudian con alguien, si administra).
create or replace function public.profesores_que_estudian_conmigo()
returns table (id uuid, full_name text, email text, grupo text)
language sql
stable
set search_path to 'public'
as $$
  select p.id, p.full_name, p.email, p.grupo
  from public.profiles p
  where p.role = 'profesor' and interno.profesor_alumno_mio(p.id)
  order by coalesce(nullif(p.full_name, ''), p.email) collate "es-CR-x-icu";
$$;
revoke execute on function public.profesores_que_estudian_conmigo() from public, anon;
grant execute on function public.profesores_que_estudian_conmigo() to authenticated, service_role;
