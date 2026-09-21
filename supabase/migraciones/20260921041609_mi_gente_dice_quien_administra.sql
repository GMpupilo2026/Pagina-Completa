drop function if exists public.mi_gente(text, text, integer, integer);

-- `is_admin` viaja en la lista porque la pantalla tiene que poder NO ofrecer
-- el cambio de rol sobre la cuenta master: un botón que la base va a rechazar
-- es peor que ninguno. Para quien administra, la lista incluye su propia fila.
create function public.mi_gente(
  p_busqueda text default null,
  p_rol text default null,
  p_limite integer default 50,
  p_desde integer default 0
)
returns table (
  id uuid, full_name text, email text, role text, grupo text,
  es_coordinador boolean, is_admin boolean,
  invitaciones_max integer, invitaciones_usadas integer,
  alumnos integer, subgrupos integer, total bigint
)
language sql
stable
security invoker
set search_path to ''
as $$
  with pelado as (
    -- Sin tildes: quien escribe "ramirez" tiene que encontrar a "Ramírez".
    select nullif(lower(translate(coalesce(p_busqueda, ''),
             'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '') as q
  ),
  gente as (
    select p.*
    from public.profiles p, pelado
    where p.id in (select public.gente_de_mi_coordinacion())
      and (p_rol is null or p.role = p_rol)
      and (pelado.q is null
           or lower(translate(coalesce(p.full_name, '') || ' ' || coalesce(p.email, '') || ' ' || coalesce(p.grupo, ''),
                              'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) like '%' || pelado.q || '%')
  )
  select g.id, g.full_name, g.email, g.role, g.grupo,
         g.es_coordinador, g.is_admin, g.invitaciones_max, g.invitaciones_usadas,
         (select count(*)::integer from public.alumnos_de(g.id)) as alumnos,
         (select count(*)::integer from public.subgrupos s where s.profesor_id = g.id) as subgrupos,
         count(*) over () as total
  from gente g
  -- Los profesores primero: son pocos y son por donde se entra a lo demás.
  order by case when g.role = 'profesor' then 0 else 1 end,
           coalesce(g.full_name, g.email)
  limit greatest(1, least(coalesce(p_limite, 50), 200))
  offset greatest(0, coalesce(p_desde, 0));
$$;

revoke execute on function public.mi_gente(text, text, integer, integer) from anon;