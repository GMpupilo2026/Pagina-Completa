-- Los subgrupos siguen SIN dar ni un permiso: son la lista que cada profesor
-- arma para sí mismo. Lo que esta función agrega es poder VOLCAR uno dentro de
-- un equipo, que es donde los permisos sí viven — «los del martes, todos al
-- equipo del martes» en un gesto, en vez de sesenta.
--
-- Es SECURITY INVOKER a propósito, como las de informes: quién ve los
-- subgrupos de quién ya lo decide la RLS de `subgrupos` (los propios, los de
-- su coordinación, todos si administra). Un filtro escrito acá sería una
-- segunda versión de esa misma regla.
create or replace function public.subgrupos_a_la_vista()
returns table (id uuid, nombre text, profesor_id uuid, profesor text, alumnos uuid[])
language sql
stable
security invoker
set search_path to 'public'
as $$
  select s.id,
         s.nombre,
         s.profesor_id,
         -- El nombre del dueño pasa por la RLS de `profiles` como todo lo
         -- demás: si no se ve, se devuelve NULL y que lo diga la pantalla, en
         -- vez de inventar un nombre.
         nullif(btrim(coalesce(p.full_name, '')), ''),
         coalesce((select array_agg(sa.alumno_id order by sa.created_at)
                     from public.subgrupo_alumnos sa
                    where sa.subgrupo_id = s.id), '{}'::uuid[])
    from public.subgrupos s
    left join public.profiles p on p.id = s.profesor_id
   order by s.nombre;
$$;

revoke execute on function public.subgrupos_a_la_vista() from public, anon;
grant execute on function public.subgrupos_a_la_vista() to authenticated;