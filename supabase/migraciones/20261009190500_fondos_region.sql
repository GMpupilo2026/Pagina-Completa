-- La franja de la región en el panel del alumno: qué dibujo le toca a cada cuenta.
--
-- La pidió el taller «Formación Ajedrez» del MEP: cada asesor regional ve
-- arriba de su panel el dibujo de su Dirección Regional, con el nombre y lo que
-- muestra; los nacionales, el mapa del país. El dibujo y su texto viven en
-- js/fondo-region.js; acá solo se guarda la clave («cartago», «nacional»…).
--
-- Es cosmético —no reparte permisos, acceso ni dinero—, pero igual lo fija
-- administración y no la persona: que el panel de un taller se vea parejo es
-- decisión de quien lo organiza. La persona lee su fila; quien administra,
-- todas. Una clave que js/fondo-region.js no conoce simplemente no se pinta.
--
-- Ver «La franja de la región» en docs/decisiones/paneles.md.

create table public.fondos_region (
  persona_id uuid primary key references public.profiles(id) on delete cascade,
  fondo text not null check (fondo ~ '^[a-z0-9-]{2,40}$'),
  fijado_por uuid references public.profiles(id) on delete set null,
  fijado_en timestamptz not null default now()
);
comment on table public.fondos_region is
  'El dibujo de la región que js/fondo-region.js pinta arriba del panel del alumno (taller del MEP). Solo la escribe fondos_region_fijar() (administración).';
create index fondos_region_fijado_por_idx on public.fondos_region (fijado_por);

alter table public.fondos_region enable row level security;
revoke all on public.fondos_region from public, anon, authenticated;
grant select on public.fondos_region to authenticated;
create policy fondos_region_ver on public.fondos_region
  for select to authenticated
  using (persona_id = (select auth.uid()) or (select public.soy_admin()));

-- Pone (o cambia) el fondo de esas cuentas; con `p_fondo` en null lo quita.
create or replace function public.fondos_region_fijar(p_personas uuid[], p_fondo text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_lista uuid[] := coalesce(p_personas, '{}');
  v_fondo text := nullif(lower(btrim(coalesce(p_fondo, ''))), '');
  n integer;
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo quien administra elige el fondo de las cuentas.' using errcode = '42501';
  end if;
  if coalesce(array_length(v_lista, 1), 0) = 0 then
    return 0;
  end if;
  if array_length(v_lista, 1) > 5000 then
    raise exception 'Demasiadas cuentas de una vez (máximo 5000).';
  end if;

  if v_fondo is null then
    delete from public.fondos_region where persona_id = any(v_lista);
    get diagnostics n = row_count;
    return n;
  end if;
  if v_fondo !~ '^[a-z0-9-]{2,40}$' then
    raise exception 'Ese fondo no existe: va en minúsculas, como «cartago» o «nacional».';
  end if;
  if exists (select 1 from unnest(v_lista) as x(id) left join public.profiles p on p.id = x.id where p.id is null) then
    raise exception 'Alguna de esas cuentas no existe.';
  end if;

  insert into public.fondos_region (persona_id, fondo, fijado_por)
  select distinct x.id, v_fondo, auth.uid() from unnest(v_lista) as x(id)
  on conflict (persona_id) do update
    set fondo = excluded.fondo, fijado_por = excluded.fijado_por, fijado_en = now();
  get diagnostics n = row_count;
  return n;
end;
$function$;
revoke execute on function public.fondos_region_fijar(uuid[], text) from public, anon;
grant execute on function public.fondos_region_fijar(uuid[], text) to authenticated;
