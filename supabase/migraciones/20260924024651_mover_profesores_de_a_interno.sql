-- profesores_de() y alumnos_de() se mudan a un esquema que la API no expone.
-- Son SECURITY DEFINER y contestan sobre OTRA persona: desde public, cualquier
-- cuenta con sesión las llamaba por RPC con el id de quien quisiera y sacaba el
-- mapa de quién estudia con quién. No se les podía quitar el execute a
-- authenticated porque cinco funciones INVOKER las llaman con los permisos de
-- quien mira; en `interno` lo siguen teniendo, pero PostgREST no las publica.
create schema if not exists interno;
revoke all on schema interno from public;
grant usage on schema interno to authenticated, service_role;

alter function public.profesores_de(uuid) set schema interno;
alter function public.alumnos_de(uuid) set schema interno;

-- Las funciones que las nombran se reescriben apuntando al esquema nuevo.
-- CREATE OR REPLACE conserva dueño, permisos y triggers.
do $$
declare r record; v_def text; n int := 0;
begin
  for r in
    select p.oid from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prosrc ~ 'public\.(profesores_de|alumnos_de)\s*\('
  loop
    v_def := regexp_replace(pg_get_functiondef(r.oid),
               'public\.(profesores_de|alumnos_de)(\s*)\(', 'interno.\1\2(', 'g');
    execute v_def;
    n := n + 1;
  end loop;
  if exists (select 1 from pg_proc p
              where p.pronamespace = 'public'::regnamespace
                and p.prosrc ~ '(^|[^a-z_.]|public\.)(profesores_de|alumnos_de)\s*\(') then
    raise exception 'Quedó una función de public nombrando a profesores_de/alumnos_de.';
  end if;
  raise notice 'Funciones reescritas: %', n;
end $$;