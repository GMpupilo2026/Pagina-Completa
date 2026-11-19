-- Las fichas «a la vista» de una cuenta de árbitro: herramientas que el árbitro
-- VE en su panel, cerradas, hasta que tenga su licencia.
--
-- Lo pidió el dueño (16/11/2026), con la cuenta de Brandon: «permitir que vea
-- las fichas pero sin poder entrar hasta tener la licencia» de Pareo Integral,
-- Pareo para DGT, Notara, Normas de título, Reclamos de tablas, Bases del
-- torneo y Mesa del árbitro.
--
-- No es un permiso: ver la ficha no abre nada. Abrir lo sigue decidiendo
-- `tengo_herramienta()` (el candado de cada página, las Edge Functions y el
-- worker); la ficha es lo mismo que ya enseña la vitrina pública. Por eso el
-- organizador puede poner a la vista cualquier herramienta, también una que él
-- no tiene (justo la que el árbitro tendría que conseguir).
--
-- Va en `arbitros_cuentas` (una lista por árbitro), que ya tiene la bitácora y
-- ninguna política de escritura: la escribe `arbitro_fichas_a_la_vista_fijar()`,
-- que deja la lista EXACTAMENTE como llega (regla de las funciones set_*) y
-- vuelve a leer lo que quedó. La lee el propio árbitro (la política de
-- `arbitros_cuentas` ya le deja ver su fila), su organizador y administración.
--
-- Ver «Las fichas a la vista» en docs/decisiones/permisos-y-roles.md.

alter table public.arbitros_cuentas
  add column a_la_vista text[] not null default '{}'::text[];
comment on column public.arbitros_cuentas.a_la_vista is
  'Herramientas que el árbitro ve en su panel, cerradas, hasta tener la licencia. No abre nada: abrir lo decide tengo_herramienta(). La escribe arbitro_fichas_a_la_vista_fijar().';

create or replace function public.arbitro_fichas_a_la_vista_fijar(p_arbitro uuid, p_herramientas text[])
 returns text[]
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_yo uuid := (select auth.uid());
  v_admin boolean := coalesce(public.soy_admin(), false);
  v_pedidas text[];
  h text;
begin
  if v_yo is null then
    raise exception 'Inicia sesión.' using errcode = '42501';
  end if;
  if not coalesce(exists (select 1 from public.arbitros_cuentas a
                           where a.arbitro_id = p_arbitro and (v_admin or a.organizador_id = v_yo)), false) then
    raise exception 'Esa cuenta no es de uno de tus árbitros.' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct x order by x), '{}'::text[]) into v_pedidas
    from unnest(coalesce(p_herramientas, '{}'::text[])) x where x is not null;
  if cardinality(v_pedidas) > 60 then
    raise exception 'Son demasiadas herramientas de una vez.' using errcode = '22023';
  end if;
  foreach h in array v_pedidas loop
    if h !~ '^[a-z0-9-]{2,40}$' or h = 'todas' then
      raise exception 'Esa herramienta no existe: %', h using errcode = '22023';
    end if;
  end loop;

  update public.arbitros_cuentas a set a_la_vista = v_pedidas where a.arbitro_id = p_arbitro;

  -- Se vuelve a LEER lo que quedó (no se devuelve lo pedido).
  return (select a.a_la_vista from public.arbitros_cuentas a where a.arbitro_id = p_arbitro);
end;
$function$;
revoke execute on function public.arbitro_fichas_a_la_vista_fijar(uuid, text[]) from public, anon;
grant execute on function public.arbitro_fichas_a_la_vista_fijar(uuid, text[]) to authenticated;
