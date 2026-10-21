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