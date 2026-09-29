-- La tienda con permiso por producto: quién compró qué.
--
-- La tienda vende cada material suelto, pero el candado de los recursos era
-- el de la Academia (cualquier cuenta con el acceso vigente) y los libros de
-- la raíz no tenían ninguno. Ver «La tienda con permiso por producto» en
-- docs/decisiones/cobros-acceso-y-tienda.md.
--
--  * compras_tienda: una fila por persona y producto. El producto es el id de
--    js/tienda-catalogo.js, que es también el nombre de su carpeta
--    (cursos/recursos/<id>/ o material/<id>/). No tiene política de
--    escritura: la escribe registrar_compra(), que valida.
--  * registrar_compra(): solo administración, que es quien entrega a mano
--    después de cobrar por WhatsApp.
--  * puede_bajar(): la pregunta del worker. SECURITY INVOKER a propósito:
--    solo mira la compra de quien pregunta (la RLS no le deja ver otra), así
--    que no contesta nada sobre otra persona.
create table if not exists public.compras_tienda (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  producto text not null check (producto ~ '^[a-z0-9-]{2,60}$'),
  otorgado_por uuid references public.profiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  primary key (profile_id, producto)
);
alter table public.compras_tienda enable row level security;

drop policy if exists compras_tienda_select on public.compras_tienda;
create policy compras_tienda_select on public.compras_tienda for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.soy_admin()));

revoke all on public.compras_tienda from anon, authenticated;
grant select on public.compras_tienda to authenticated;

create or replace function public.registrar_compra(p_profile uuid, p_producto text, p_registrar boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo administración registra compras.' using errcode = '42501';
  end if;
  if p_producto is null or p_producto !~ '^[a-z0-9-]{2,60}$' then
    raise exception 'Ese producto no existe.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile) then
    raise exception 'No se encontró esa cuenta.' using errcode = 'P0002';
  end if;
  if p_registrar then
    insert into public.compras_tienda (profile_id, producto, otorgado_por)
    values (p_profile, p_producto, auth.uid())
    on conflict (profile_id, producto) do nothing;
  else
    delete from public.compras_tienda where profile_id = p_profile and producto = p_producto;
  end if;
end;
$$;
revoke execute on function public.registrar_compra(uuid, text, boolean) from public, anon;
grant execute on function public.registrar_compra(uuid, text, boolean) to authenticated;

create or replace function public.puede_bajar(p_producto text, p_basta_acceso boolean default false)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(public.soy_admin(), false)
      or (coalesce(p_basta_acceso, false) and coalesce(public.acceso_vigente(), false))
      or exists (select 1 from public.compras_tienda c
                  where c.profile_id = (select auth.uid()) and c.producto = p_producto);
$$;
revoke execute on function public.puede_bajar(text, boolean) from public, anon;
grant execute on function public.puede_bajar(text, boolean) to authenticated;