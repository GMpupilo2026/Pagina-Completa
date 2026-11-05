-- Metropolitano 2026: la alimentación con menús, quién los prepara y la
-- estimación. Ver «Los menús de la alimentación» en
-- docs/decisiones/cuentas-y-formularios.md.
--
-- 1. Las cocinas (metropolitano_menu_cocinas): la soda o la cocinera que
--    prepara cada plato. Las agrega administración.
-- 2. Los menús (metropolitano_menu): cada plato de cada comida (desayuno,
--    almuerzo, cena) con su nombre, su descripción, su foto, su precio por día
--    y la cocina que lo prepara. El mismo plato puede ofrecerlo más de una
--    cocina (una fila por cocina, cada una con su precio): quien se inscribe
--    elige el plato y quién se lo prepara. Las fotos van en el bucket PÚBLICO
--    metropolitano-menu, porque las ve quien se inscribe sin cuenta.
-- 3. «¿Va a necesitar alimentación?»: sí, aún no lo sé o no
--    (alimentacion). Con sí, marca las comidas y los días y elige su plato,
--    que se cobra cada día con la inscripción: después del código de
--    descuento (que es de la inscripción) y antes del IVA, como el parqueo.
--    La base recalcula el monto con sus precios y guarda lo elegido con el
--    precio de ese momento (menu, comidas_usd). Una comida sin platos en su
--    menú sigue como antes: una solicitud sin costo. Con «aún no lo sé», no
--    elige ni paga nada: dice qué comidas y qué días podría necesitar
--    (tal_vez), para la estimación de los platos adicionales. Los GM, IM y
--    WGM invitados no pagan su alimentación.
-- 4. Una vez inscrita, la alimentación con costo no se cambia desde
--    «Corregir la inscripción»: cambiaría el monto.

create table public.metropolitano_menu_cocinas (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null check (length(btrim(nombre)) between 2 and 80),
  detalle         text check (length(detalle) <= 300),
  orden           int not null default 0 check (orden between 0 and 999),
  activo          boolean not null default true,
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now(),
  actualizado_por uuid references public.profiles(id) on delete set null
);
alter table public.metropolitano_menu_cocinas enable row level security;
create policy metropolitano_menu_cocinas_ver on public.metropolitano_menu_cocinas for select to authenticated
  using ((select public.soy_admin()));
-- Nadie la escribe desde afuera: la escriben metropolitano_cocina_guardar y _quitar.
revoke all on table public.metropolitano_menu_cocinas from anon;
revoke insert, update, delete, truncate, references, trigger on table public.metropolitano_menu_cocinas from authenticated;
grant select on table public.metropolitano_menu_cocinas to authenticated;
create trigger auditar after insert or delete or update on public.metropolitano_menu_cocinas
  for each row execute function interno.auditar('nombre', 'activo');

create table public.metropolitano_menu (
  id              uuid primary key default gen_random_uuid(),
  comida          text not null check (comida in ('desayuno', 'almuerzo', 'cena')),
  nombre          text not null check (length(btrim(nombre)) between 2 and 80),
  descripcion     text check (length(descripcion) <= 500),
  cocina          uuid references public.metropolitano_menu_cocinas(id) on delete restrict,
  precio_usd      numeric(8,2) not null default 0 check (precio_usd >= 0 and precio_usd <= 200),
  imagen          text check (imagen ~ '^menu/[A-Za-z0-9._-]{1,100}\.(jpg|png|webp)$'),
  orden           int not null default 0 check (orden between 0 and 999),
  activo          boolean not null default true,
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now(),
  actualizado_por uuid references public.profiles(id) on delete set null
);
create index metropolitano_menu_cocina on public.metropolitano_menu (cocina);
alter table public.metropolitano_menu enable row level security;
create policy metropolitano_menu_ver on public.metropolitano_menu for select to authenticated
  using ((select public.soy_admin()));
-- Nadie la escribe desde afuera: la escriben metropolitano_menu_guardar y _quitar.
revoke all on table public.metropolitano_menu from anon;
revoke insert, update, delete, truncate, references, trigger on table public.metropolitano_menu from authenticated;
grant select on table public.metropolitano_menu to authenticated;
create trigger auditar after insert or delete or update on public.metropolitano_menu
  for each row execute function interno.auditar('comida', 'nombre', 'cocina', 'precio_usd', 'activo');

-- Las fotos de los platos: públicas (las ve quien se inscribe, sin cuenta),
-- de hasta 1 MB y solo imágenes rasterizadas (un SVG puede llevar código).
-- Las sube, cambia y borra solo administración.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('metropolitano-menu', 'metropolitano-menu', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1048576,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
create policy metropolitano_menu_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'metropolitano-menu' and (select public.soy_admin()));
create policy metropolitano_menu_update on storage.objects for update to authenticated
  using (bucket_id = 'metropolitano-menu' and (select public.soy_admin()))
  with check (bucket_id = 'metropolitano-menu' and (select public.soy_admin()));
create policy metropolitano_menu_delete on storage.objects for delete to authenticated
  using (bucket_id = 'metropolitano-menu' and (select public.soy_admin()));

-- En la inscripción: la respuesta, lo elegido con el precio de ese momento
-- ([{comida, id, nombre, cocina, precio_usd, dias, usd}]) y, con «aún no lo
-- sé», lo que podría necesitar ({comidas, desde, hasta}).
alter table public.metropolitano_inscripciones
  add column alimentacion text not null default 'no' check (alimentacion in ('si', 'tal_vez', 'no')),
  add column menu jsonb check (menu is null or jsonb_typeof(menu) = 'array'),
  add column comidas_usd numeric(8,2) not null default 0 check (comidas_usd >= 0),
  add column tal_vez jsonb check (tal_vez is null or jsonb_typeof(tal_vez) = 'object');

-- El costo de la alimentación de una persona: por cada comida marcada que
-- tiene platos en su menú, el plato elegido (activo y de esa comida) por los
-- días de la alimentación (del primero al último, los dos incluidos). Una
-- comida sin platos no cuesta en la inscripción. Lanza el mensaje si falta
-- elegir o el plato ya no está.
create or replace function interno.metropolitano_menu_costo(p_comidas jsonb, p_menu jsonb, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_comida text;
  v_id uuid;
  v_m public.metropolitano_menu%rowtype;
  v_cocina text;
  v_dias int;
  v_detalle jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_de text;
  v_para text;
begin
  if jsonb_typeof(p_comidas) is distinct from 'array' or jsonb_array_length(p_comidas) = 0 or p_desde is null or p_hasta is null then
    return jsonb_build_object('usd', 0, 'detalle', null);
  end if;
  v_dias := p_hasta - p_desde + 1;
  for v_comida in select e from jsonb_array_elements_text(p_comidas) e order by array_position(array['desayuno', 'almuerzo', 'cena'], e) loop
    continue when not exists (select 1 from public.metropolitano_menu m where m.comida = v_comida and m.activo);
    v_de := case v_comida when 'desayuno' then 'del desayuno' when 'almuerzo' then 'del almuerzo' else 'de la cena' end;
    v_para := case v_comida when 'desayuno' then 'el desayuno' when 'almuerzo' then 'el almuerzo' else 'la cena' end;
    if coalesce(p_menu->>v_comida, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'falta elegir el plato %.', v_de;
    end if;
    v_id := (p_menu->>v_comida)::uuid;
    select * into v_m from public.metropolitano_menu m where m.id = v_id and m.comida = v_comida and m.activo;
    if not found then
      raise exception 'el plato elegido para % ya no está en el menú: elige otro.', v_para;
    end if;
    select c.nombre into v_cocina from public.metropolitano_menu_cocinas c where c.id = v_m.cocina;
    v_detalle := v_detalle || jsonb_build_object('comida', v_comida, 'id', v_m.id, 'nombre', v_m.nombre, 'cocina', v_cocina,
      'precio_usd', v_m.precio_usd, 'dias', v_dias, 'usd', v_m.precio_usd * v_dias);
    v_total := v_total + v_m.precio_usd * v_dias;
  end loop;
  return jsonb_build_object('usd', round(v_total, 2), 'detalle', case when jsonb_array_length(v_detalle) > 0 then v_detalle end);
end;
$$;
revoke execute on function interno.metropolitano_menu_costo(jsonb, jsonb, date, date) from public, anon, authenticated;

-- «Aún no lo sé»: qué comidas y qué días podría necesitar (al menos una
-- comida; sin días, los del torneo). Lanza el mensaje si algo no cuadra.
create or replace function interno.metropolitano_tal_vez(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_comidas text[];
  v_desde date;
  v_hasta date;
begin
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'comidas') is distinct from 'array' then
    raise exception 'marca qué comidas podría necesitar.';
  end if;
  select coalesce(array_agg(distinct e), '{}') into v_comidas from jsonb_array_elements_text(p->'comidas') e;
  if cardinality(v_comidas) = 0 or not (v_comidas <@ array['desayuno', 'almuerzo', 'cena']) then
    raise exception 'marca qué comidas podría necesitar.';
  end if;
  v_desde := coalesce(nullif(p->>'desde', '')::date, date '2026-12-26');
  v_hasta := coalesce(nullif(p->>'hasta', '')::date, date '2026-12-30');
  if v_desde > v_hasta or v_desde < date '2026-12-20' or v_hasta > date '2027-01-03' then
    raise exception 'revisa los días en que podría necesitar alimentación.';
  end if;
  return jsonb_build_object('comidas', to_jsonb(v_comidas), 'desde', v_desde, 'hasta', v_hasta);
end;
$$;
revoke execute on function interno.metropolitano_tal_vez(jsonb) from public, anon, authenticated;

-- Para la página de inscripción (sin cuenta): los platos que se ofrecen, en
-- su orden, con la cocina que los prepara.
create or replace function public.metropolitano_menu_ver()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'comida', m.comida, 'nombre', m.nombre,
           'descripcion', m.descripcion, 'cocina', c.nombre, 'cocina_detalle', c.detalle, 'precio_usd', m.precio_usd, 'imagen', m.imagen)
           order by array_position(array['desayuno', 'almuerzo', 'cena'], m.comida), m.orden, m.nombre, c.orden, c.nombre), '[]'::jsonb)
    from public.metropolitano_menu m left join public.metropolitano_menu_cocinas c on c.id = m.cocina
   where m.activo and (c.id is null or c.activo);
$$;
revoke execute on function public.metropolitano_menu_ver() from public;
grant execute on function public.metropolitano_menu_ver() to anon, authenticated;

-- Para administración: las cocinas y los platos (también los quitados), con
-- cuántas personas eligió cada plato; los platos que hay que servir cada día
-- (inscripciones activas cuyo pago no se rechazó) y, para la estimación,
-- cuántas personas dijeron «aún no lo sé» por día y comida.
create or replace function public.metropolitano_menu_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo administración ve los menús.';
  end if;
  return jsonb_build_object(
    'cocinas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'detalle', c.detalle,
        'orden', c.orden, 'activo', c.activo,
        'platos', (select count(*) from public.metropolitano_menu m where m.cocina = c.id))
        order by c.orden, c.nombre)
      from public.metropolitano_menu_cocinas c), '[]'::jsonb),
    'platos', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'comida', m.comida, 'nombre', m.nombre,
        'descripcion', m.descripcion, 'cocina', m.cocina, 'precio_usd', m.precio_usd, 'imagen', m.imagen, 'orden', m.orden, 'activo', m.activo,
        'personas', (select count(*) from public.metropolitano_inscripciones i, jsonb_array_elements(i.menu) e
                      where i.estado = 'activa' and i.pago_estado <> 'rechazado' and e->>'id' = m.id::text))
        order by array_position(array['desayuno', 'almuerzo', 'cena'], m.comida), m.orden, m.nombre)
      from public.metropolitano_menu m), '[]'::jsonb),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', t.dia, 'id', t.id, 'platos', t.n) order by t.dia, t.id)
      from (select d::date dia, e->>'id' id, count(*) n
              from public.metropolitano_inscripciones i, jsonb_array_elements(i.menu) e,
                   generate_series(i.comidas_desde, i.comidas_hasta, interval '1 day') d
             where i.estado = 'activa' and i.pago_estado <> 'rechazado'
             group by 1, 2) t), '[]'::jsonb),
    'tal_vez', coalesce((select jsonb_agg(jsonb_build_object('dia', t.dia, 'comida', t.comida, 'personas', t.n) order by t.dia, t.comida)
      from (select d::date dia, c comida, count(*) n
              from public.metropolitano_inscripciones i, jsonb_array_elements_text(i.tal_vez->'comidas') c,
                   generate_series((i.tal_vez->>'desde')::date, (i.tal_vez->>'hasta')::date, interval '1 day') d
             where i.estado = 'activa' and i.alimentacion = 'tal_vez'
             group by 1, 2) t), '[]'::jsonb));
end;
$$;
revoke execute on function public.metropolitano_menu_admin() from public, anon;
grant execute on function public.metropolitano_menu_admin() to authenticated;

-- Para administración: agregar una cocina (sin id) o cambiarla (con id).
create or replace function public.metropolitano_cocina_guardar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_nombre text := btrim(coalesce(p->>'nombre', ''));
  v_detalle text := nullif(btrim(coalesce(p->>'detalle', '')), '');
  v_orden int;
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo administración arma los menús.';
  end if;
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'La cocina llegó con un formato inválido.';
  end if;
  if length(v_nombre) < 2 or length(v_nombre) > 80 then
    raise exception 'El nombre de quien prepara va de 2 a 80 letras.';
  end if;
  if length(coalesce(v_detalle, '')) > 300 then
    raise exception 'El detalle va hasta 300 letras.';
  end if;
  v_orden := coalesce(nullif(p->>'orden', '')::int, 0);
  if v_orden < 0 or v_orden > 999 then
    raise exception 'El orden va de 0 a 999.';
  end if;
  if nullif(p->>'id', '') is null then
    insert into public.metropolitano_menu_cocinas (nombre, detalle, orden, activo, actualizado_por)
    values (v_nombre, v_detalle, v_orden, coalesce((p->>'activo')::boolean, true), auth.uid());
  else
    update public.metropolitano_menu_cocinas
       set nombre = v_nombre, detalle = v_detalle, orden = v_orden, activo = coalesce((p->>'activo')::boolean, activo),
           actualizado = now(), actualizado_por = auth.uid()
     where id = (p->>'id')::uuid
    returning id into v_id;
    if v_id is null then
      raise exception 'Esa cocina ya no existe.';
    end if;
  end if;
  return public.metropolitano_menu_admin();
end;
$$;
revoke execute on function public.metropolitano_cocina_guardar(jsonb) from public, anon;
grant execute on function public.metropolitano_cocina_guardar(jsonb) to authenticated;

-- Para administración: quitar una cocina. Si tiene platos, no se borra:
-- deja de ofrecerse (y sus platos con ella).
create or replace function public.metropolitano_cocina_quitar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo administración arma los menús.';
  end if;
  if exists (select 1 from public.metropolitano_menu m where m.cocina = p_id) then
    update public.metropolitano_menu_cocinas set activo = false, actualizado = now(), actualizado_por = auth.uid() where id = p_id;
  else
    delete from public.metropolitano_menu_cocinas where id = p_id;
  end if;
  return public.metropolitano_menu_admin();
end;
$$;
revoke execute on function public.metropolitano_cocina_quitar(uuid) from public, anon;
grant execute on function public.metropolitano_cocina_quitar(uuid) to authenticated;

-- Para administración: agregar un plato (sin id) o cambiarlo (con id). El
-- precio nuevo vale para las inscripciones que vienen: las ya hechas guardan
-- el suyo.
create or replace function public.metropolitano_menu_guardar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_comida text := p->>'comida';
  v_nombre text := btrim(coalesce(p->>'nombre', ''));
  v_desc text := nullif(btrim(coalesce(p->>'descripcion', '')), '');
  v_cocina uuid := nullif(p->>'cocina', '')::uuid;
  v_precio numeric;
  v_imagen text := nullif(p->>'imagen', '');
  v_orden int;
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo administración arma los menús.';
  end if;
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'El plato llegó con un formato inválido.';
  end if;
  if coalesce(v_comida, '') not in ('desayuno', 'almuerzo', 'cena') then
    raise exception 'Elige si es desayuno, almuerzo o cena.';
  end if;
  if length(v_nombre) < 2 or length(v_nombre) > 80 then
    raise exception 'El nombre del plato va de 2 a 80 letras.';
  end if;
  if length(coalesce(v_desc, '')) > 500 then
    raise exception 'La descripción va hasta 500 letras.';
  end if;
  if v_cocina is not null and not exists (select 1 from public.metropolitano_menu_cocinas c where c.id = v_cocina) then
    raise exception 'Esa cocina ya no existe: elige otra.';
  end if;
  v_precio := nullif(p->>'precio_usd', '')::numeric;
  if v_precio is null or v_precio < 0 or v_precio > 200 then
    raise exception 'El precio por día va de $0 a $200.';
  end if;
  v_orden := coalesce(nullif(p->>'orden', '')::int, 0);
  if v_orden < 0 or v_orden > 999 then
    raise exception 'El orden va de 0 a 999.';
  end if;
  if v_imagen is not null and (v_imagen !~ '^menu/[A-Za-z0-9._-]{1,100}\.(jpg|png|webp)$'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'metropolitano-menu' and o.name = v_imagen)) then
    raise exception 'No se pudo leer la foto del plato: vuelve a elegirla.';
  end if;
  if nullif(p->>'id', '') is null then
    insert into public.metropolitano_menu (comida, nombre, descripcion, cocina, precio_usd, imagen, orden, activo, actualizado_por)
    values (v_comida, v_nombre, v_desc, v_cocina, round(v_precio, 2), v_imagen, v_orden, coalesce((p->>'activo')::boolean, true), auth.uid());
  else
    update public.metropolitano_menu
       set comida = v_comida, nombre = v_nombre, descripcion = v_desc, cocina = v_cocina, precio_usd = round(v_precio, 2),
           imagen = v_imagen, orden = v_orden, activo = coalesce((p->>'activo')::boolean, activo),
           actualizado = now(), actualizado_por = auth.uid()
     where id = (p->>'id')::uuid
    returning id into v_id;
    if v_id is null then
      raise exception 'Ese plato ya no existe.';
    end if;
  end if;
  return public.metropolitano_menu_admin();
end;
$$;
revoke execute on function public.metropolitano_menu_guardar(jsonb) from public, anon;
grant execute on function public.metropolitano_menu_guardar(jsonb) to authenticated;

-- Para administración: quitar un plato. Si alguien ya lo eligió, no se borra
-- (su inscripción lo nombra): deja de ofrecerse.
create or replace function public.metropolitano_menu_quitar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo administración arma los menús.';
  end if;
  if exists (select 1 from public.metropolitano_inscripciones i, jsonb_array_elements(i.menu) e where e->>'id' = p_id::text) then
    update public.metropolitano_menu set activo = false, actualizado = now(), actualizado_por = auth.uid() where id = p_id;
  else
    delete from public.metropolitano_menu where id = p_id;
  end if;
  return public.metropolitano_menu_admin();
end;
$$;
revoke execute on function public.metropolitano_menu_quitar(uuid) from public, anon;
grant execute on function public.metropolitano_menu_quitar(uuid) to authenticated;

-- «Corregir la inscripción» no cambia una alimentación que tiene costo (ni
-- agrega una comida cuyo menú se cobra): cambiaría el monto ya pagado. Las
-- comidas se comparan como conjunto (el orden no importa).
create or replace function interno.metropolitano_menu_fijo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if ((select coalesce(array_agg(e order by e), '{}') from unnest(new.comidas) e), new.comidas_desde, new.comidas_hasta)
       is distinct from ((select coalesce(array_agg(e order by e), '{}') from unnest(old.comidas) e), old.comidas_desde, old.comidas_hasta)
     and (old.comidas_usd > 0
          or exists (select 1 from public.metropolitano_menu m where m.activo and m.precio_usd > 0 and m.comida = any (new.comidas))) then
    raise exception 'La alimentación con menú ya está en el monto: para cambiarla, escribe a metropolitano@fcacostarica.com.';
  end if;
  return new;
end;
$$;
revoke execute on function interno.metropolitano_menu_fijo() from public, anon, authenticated;
create trigger metropolitano_menu_fijo before update of comidas, comidas_desde, comidas_hasta on public.metropolitano_inscripciones
  for each row execute function interno.metropolitano_menu_fijo();

-- La inscripción, con la alimentación (sí, aún no lo sé o no) y el menú en el
-- monto. Lo demás queda igual que en 20261105044946_metropolitano_inscribir_cupo_enlace:
-- se toma la definición vigente y se le cambian cuatro pedazos (si alguno no
-- está tal cual, no se cambia nada). La definición completa queda en el
-- retrato del esquema.
do $migracion$
declare
  d text := pg_get_functiondef('public.metropolitano_inscribir(jsonb)'::regprocedure);
  cambios text[][] := array[
    array[$a$  v_enlace text;
begin$a$, $b$  v_enlace text;
  v_menu jsonb;
  v_tal_vez jsonb;
begin$b$],
    array[$a$    calc := calc || r;
    v_total := v_total + (r->>'monto')::numeric;$a$, $b$    -- La alimentación: con «sí», las comidas marcadas y el plato elegido de
    -- cada una (metropolitano_menu) por los días de la alimentación, con el
    -- precio que tiene la base; se suma después del código de descuento,
    -- como el parqueo. Los GM, IM y WGM invitados no la pagan: se la da la
    -- organización. Con «aún no lo sé», lo que podría necesitar, sin costo.
    if x->>'alimentacion' = 'si' and jsonb_array_length(r->'comidas') = 0
       and not (r->>'rol' = 'jugador' and r->>'titulo' in ('GM', 'IM', 'WGM')) then
      return jsonb_build_object('ok', false, 'persona', i, 'error',
        case when quien = '' then 'Marca qué comidas necesita.' else quien || 'marca qué comidas necesita.' end);
    end if;
    if not (r->>'rol' = 'jugador' and r->>'titulo' in ('GM', 'IM', 'WGM')) and jsonb_array_length(r->'comidas') > 0 then
      begin
        v_menu := interno.metropolitano_menu_costo(r->'comidas', x->'menu', (x->>'comidas_desde')::date, (x->>'comidas_hasta')::date);
      exception when raise_exception then
        return jsonb_build_object('ok', false, 'persona', i, 'error',
          case when quien = '' then upper(left(sqlerrm, 1)) || substr(sqlerrm, 2) else quien || sqlerrm end);
      end;
      if jsonb_typeof(v_menu->'detalle') = 'array' then
        r := r || jsonb_build_object('monto', (r->>'monto')::numeric + (v_menu->>'usd')::numeric,
                                     'menu', v_menu->'detalle', 'comidas_usd', (v_menu->>'usd')::numeric);
      end if;
    end if;
    if jsonb_array_length(r->'comidas') > 0 then
      r := r || jsonb_build_object('alimentacion', 'si');
    elsif x->>'alimentacion' = 'tal_vez' then
      begin
        v_tal_vez := interno.metropolitano_tal_vez(x->'tal_vez');
      exception when raise_exception then
        return jsonb_build_object('ok', false, 'persona', i, 'error',
          case when quien = '' then upper(left(sqlerrm, 1)) || substr(sqlerrm, 2) else quien || sqlerrm end);
      end;
      r := r || jsonb_build_object('alimentacion', 'tal_vez', 'tal_vez', v_tal_vez);
    end if;
    calc := calc || r;
    v_total := v_total + (r->>'monto')::numeric;$b$],
    array[$a$codigo_descuento, descuento_pct, parqueo, placa, parqueo_usd, acepta_hospedaje, hospedaje_version,$a$,
          $b$codigo_descuento, descuento_pct, parqueo, placa, parqueo_usd, alimentacion, menu, comidas_usd, tal_vez, acepta_hospedaje, hospedaje_version,$b$],
    array[$a$coalesce((r->>'parqueo')::boolean, false), r->>'placa', coalesce((r->>'parqueo_usd')::numeric, 0),$a$,
          $b$coalesce((r->>'parqueo')::boolean, false), r->>'placa', coalesce((r->>'parqueo_usd')::numeric, 0),
        coalesce(r->>'alimentacion', 'no'), case when jsonb_typeof(r->'menu') = 'array' then r->'menu' end,
        coalesce((r->>'comidas_usd')::numeric, 0), case when jsonb_typeof(r->'tal_vez') = 'object' then r->'tal_vez' end,$b$]];
  k int;
begin
  for k in 1 .. array_length(cambios, 1) loop
    if (length(d) - length(replace(d, cambios[k][1], ''))) / length(cambios[k][1]) <> 1 then
      raise exception 'metropolitano_inscribir no es la esperada: el cambio % no encontró su texto exacto una vez.', k;
    end if;
    d := replace(d, cambios[k][1], cambios[k][2]);
  end loop;
  execute d;
end;
$migracion$;
