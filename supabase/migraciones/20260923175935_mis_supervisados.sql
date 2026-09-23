-- Los estudiantes a cargo de quien supervisa: los que le asignaron, los
-- alumnos de los profesores que le asignaron y los suyos propios. Informes
-- filtra por acá para no mezclar a los "compañeros" que la RLS de profiles
-- también le deja ver, pero de los que no tiene ni un dato.
create or replace function public.mis_supervisados()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select sc.persona_id from public.supervisor_cuentas sc
   where sc.supervisor_id = auth.uid() and public.soy_supervisor()
  union
  select a from public.supervisor_cuentas sc
    cross join lateral public.alumnos_de(sc.persona_id) a
   where sc.supervisor_id = auth.uid() and public.soy_supervisor()
  union
  select a from public.alumnos_de(auth.uid()) a where public.soy_supervisor();
$$;
revoke execute on function public.mis_supervisados() from public, anon;
grant execute on function public.mis_supervisados() to authenticated, service_role;
