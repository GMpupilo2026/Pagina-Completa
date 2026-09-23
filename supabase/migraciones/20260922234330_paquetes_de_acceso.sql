-- Paquetes de acceso: cuántas cuentas de alumno se pagaron, hasta cuándo, y quiénes las usan.
create table public.paquetes_acceso (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  titular_id uuid references public.profiles(id) on delete set null,
  cupos integer not null check (cupos between 1 and 5000),
  vigente_desde date not null default ((now() at time zone 'America/Costa_Rica')::date),
  vigente_hasta date not null,
  precio_mensual numeric(12,2) check (precio_mensual is null or precio_mensual >= 0),
  moneda text not null default 'CRC' check (moneda in ('CRC','USD')),
  notas text check (notas is null or length(notas) <= 1000),
  creado_por uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint paquetes_acceso_fechas check (vigente_hasta >= vigente_desde)
);

create table public.paquete_alumnos (
  paquete_id uuid not null references public.paquetes_acceso(id) on delete cascade,
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  agregado_at timestamptz not null default now(),
  primary key (paquete_id, alumno_id)
);
create index paquete_alumnos_alumno_idx on public.paquete_alumnos(alumno_id);
create index paquetes_acceso_titular_idx on public.paquetes_acceso(titular_id);

create table public.acceso_config (
  id boolean primary key default true check (id),
  exigido boolean not null default false,
  cambiado_por uuid references public.profiles(id) on delete set null,
  cambiado_at timestamptz
);
insert into public.acceso_config default values;

alter table public.paquetes_acceso enable row level security;
alter table public.paquete_alumnos enable row level security;
alter table public.acceso_config enable row level security;

revoke all on public.paquetes_acceso, public.paquete_alumnos, public.acceso_config from anon;
revoke insert, update, delete on public.paquetes_acceso, public.paquete_alumnos, public.acceso_config from authenticated;

create or replace function public.puede_ver_paquete(p_paquete uuid)
returns boolean language sql stable security definer
set search_path = public set row_security to off as $$
  select exists (
    select 1 from public.paquetes_acceso p
     where p.id = p_paquete
       and (coalesce((select pr.is_admin from public.profiles pr where pr.id = auth.uid()), false)
            or p.titular_id = auth.uid()
            or (p.titular_id is not null and public.bajo_mi_coordinacion(p.titular_id)))
  );
$$;

create policy paquetes_acceso_select on public.paquetes_acceso
  for select to authenticated using (public.puede_ver_paquete(id));
create policy paquete_alumnos_select on public.paquete_alumnos
  for select to authenticated using (alumno_id = auth.uid() or public.puede_ver_paquete(paquete_id));
create policy acceso_config_select on public.acceso_config
  for select to authenticated using (true);

create or replace function public.soy_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.paquete_guardar(
  p_id uuid, p_nombre text, p_titular uuid, p_cupos integer,
  p_desde date, p_hasta date, p_precio numeric, p_moneda text, p_notas text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_usados integer; v_rol text;
begin
  if not public.soy_admin() then raise exception 'Solo quien administra arma los paquetes de acceso.'; end if;
  if p_titular is not null then
    select role into v_rol from public.profiles where id = p_titular;
    if v_rol is null or v_rol not in ('profesor','admin') then
      raise exception 'El titular de un paquete tiene que ser del equipo docente.';
    end if;
  end if;
  if p_id is null then
    insert into public.paquetes_acceso (nombre, titular_id, cupos, vigente_desde, vigente_hasta, precio_mensual, moneda, notas)
    values (btrim(p_nombre), p_titular, p_cupos,
            coalesce(p_desde, (now() at time zone 'America/Costa_Rica')::date), p_hasta,
            p_precio, coalesce(p_moneda, 'CRC'), nullif(btrim(coalesce(p_notas, '')), ''))
    returning id into v_id;
  else
    select count(*) into v_usados from public.paquete_alumnos where paquete_id = p_id;
    if p_cupos < v_usados then
      raise exception 'El paquete ya tiene % alumnos: no se le pueden dejar % cupos. Quita alumnos primero.', v_usados, p_cupos;
    end if;
    update public.paquetes_acceso set
      nombre = btrim(p_nombre), titular_id = p_titular, cupos = p_cupos,
      vigente_desde = coalesce(p_desde, vigente_desde), vigente_hasta = p_hasta,
      precio_mensual = p_precio, moneda = coalesce(p_moneda, 'CRC'),
      notas = nullif(btrim(coalesce(p_notas, '')), '')
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Ese paquete ya no existe.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.paquete_borrar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.soy_admin() then raise exception 'Solo quien administra borra paquetes.'; end if;
  delete from public.paquetes_acceso where id = p_id;
end $$;

-- Deja la lista EXACTAMENTE como se mandó (la regla de set_teachers), salvo lo
-- que quien llama no alcanza: un titular no le quita a nadie que le haya puesto
-- quien administra, porque la pantalla no lo ve.
create or replace function public.paquete_set_alumnos(p_id uuid, p_alumnos uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_admin boolean := public.soy_admin(); v_p public.paquetes_acceso; v_final uuid[]; v_malos integer; v_total integer;
begin
  select * into v_p from public.paquetes_acceso where id = p_id;
  if v_p.id is null then raise exception 'Ese paquete ya no existe.'; end if;
  if not v_admin and v_p.titular_id is distinct from auth.uid() then
    raise exception 'Este paquete no es tuyo.';
  end if;
  p_alumnos := coalesce(array(select distinct a from unnest(p_alumnos) a where a is not null), '{}');

  select count(*) into v_malos from unnest(p_alumnos) a
   where not exists (select 1 from public.profiles pr where pr.id = a and pr.role = 'alumno');
  if v_malos > 0 then raise exception 'Solo se ponen cuentas de alumno en un paquete (% no lo son).', v_malos; end if;

  if not v_admin then
    select count(*) into v_malos from unnest(p_alumnos) a where not public.soy_profesor_de(a)
       and not exists (select 1 from public.paquete_alumnos pa where pa.paquete_id = p_id and pa.alumno_id = a);
    if v_malos > 0 then raise exception 'Solo puedes poner a tus propios alumnos (% no lo son).', v_malos; end if;
    -- Lo que ya estaba y no es suyo se conserva.
    v_final := array(select distinct x from (
      select unnest(p_alumnos) x
      union select pa.alumno_id from public.paquete_alumnos pa
       where pa.paquete_id = p_id and not public.soy_profesor_de(pa.alumno_id)) s);
  else
    v_final := p_alumnos;
  end if;

  v_total := coalesce(array_length(v_final, 1), 0);
  if v_total > v_p.cupos then
    raise exception 'El paquete tiene % cupos y la lista trae % alumnos.', v_p.cupos, v_total;
  end if;

  delete from public.paquete_alumnos where paquete_id = p_id and not (alumno_id = any (v_final));
  insert into public.paquete_alumnos (paquete_id, alumno_id)
  select p_id, a from unnest(v_final) a on conflict do nothing;

  select count(*) into v_total from public.paquete_alumnos where paquete_id = p_id;
  return jsonb_build_object('ok', true, 'total', v_total, 'cupos', v_p.cupos);
end $$;

create or replace function public.acceso_set_exigido(p_exigido boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v boolean;
begin
  if not public.soy_admin() then raise exception 'Solo quien administra decide si se exige el acceso.'; end if;
  update public.acceso_config set exigido = p_exigido, cambiado_por = auth.uid(), cambiado_at = now() where id;
  select exigido into v from public.acceso_config where id;
  if v is distinct from p_exigido then raise exception 'No quedó guardado.'; end if;
  return v;
end $$;

-- Lo único que necesita saber una página: si quien mira puede usar la Academia hoy.
create or replace function public.mi_acceso()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_rol text; v_admin boolean; v_exigido boolean; v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
        v_hasta date; v_nombre text;
begin
  select role, is_admin into v_rol, v_admin from public.profiles where id = auth.uid();
  select exigido into v_exigido from public.acceso_config where id;
  v_exigido := coalesce(v_exigido, false);
  if v_rol is null then
    return jsonb_build_object('vigente', true, 'motivo', 'sin_perfil', 'exigido', v_exigido);
  end if;
  if coalesce(v_admin, false) or v_rol <> 'alumno' then
    return jsonb_build_object('vigente', true, 'motivo', 'equipo', 'exigido', v_exigido);
  end if;
  select p.vigente_hasta, p.nombre into v_hasta, v_nombre
    from public.paquete_alumnos pa join public.paquetes_acceso p on p.id = pa.paquete_id
   where pa.alumno_id = auth.uid() and p.vigente_desde <= v_hoy
   order by p.vigente_hasta desc limit 1;
  if v_hasta is not null and v_hasta >= v_hoy then
    return jsonb_build_object('vigente', true, 'motivo', 'paquete', 'exigido', v_exigido,
      'hasta', v_hasta, 'dias', v_hasta - v_hoy, 'paquete', v_nombre);
  end if;
  return jsonb_build_object('vigente', not v_exigido,
    'motivo', case when not v_exigido then 'sin_exigir' when v_hasta is null then 'sin_paquete' else 'vencido' end,
    'exigido', v_exigido, 'hasta', v_hasta, 'paquete', v_nombre);
end $$;

create or replace function public.acceso_resumen()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_hoy date := (now() at time zone 'America/Costa_Rica')::date; r jsonb;
begin
  if not public.soy_admin() then raise exception 'Solo quien administra.'; end if;
  with al as (
    select pr.id,
      (select max(p.vigente_hasta) from public.paquete_alumnos pa join public.paquetes_acceso p on p.id = pa.paquete_id
        where pa.alumno_id = pr.id and p.vigente_desde <= v_hoy) as hasta
    from public.profiles pr where pr.role = 'alumno' and not coalesce(pr.is_admin, false))
  select jsonb_build_object(
    'alumnos', count(*),
    'con_acceso', count(*) filter (where hasta >= v_hoy),
    'vencidos', count(*) filter (where hasta < v_hoy),
    'sin_paquete', count(*) filter (where hasta is null),
    'exigido', (select exigido from public.acceso_config where id))
  into r from al;
  return r;
end $$;

-- La lista de paquetes con cuántos cupos se usan. INVOKER: qué paquetes ve
-- cada quien lo decide la RLS.
create or replace function public.paquetes_con_uso()
returns table (id uuid, nombre text, titular_id uuid, titular_nombre text, cupos integer, usados integer,
               vigente_desde date, vigente_hasta date, precio_mensual numeric, moneda text, notas text)
language sql stable security invoker set search_path = public as $$
  select p.id, p.nombre, p.titular_id, t.full_name, p.cupos,
         (select count(*)::int from public.paquete_alumnos pa where pa.paquete_id = p.id),
         p.vigente_desde, p.vigente_hasta, p.precio_mensual, p.moneda, p.notas
    from public.paquetes_acceso p left join public.profiles t on t.id = p.titular_id
   order by p.vigente_hasta desc, p.nombre;
$$;

revoke execute on function public.puede_ver_paquete(uuid), public.soy_admin(),
  public.paquete_guardar(uuid, text, uuid, integer, date, date, numeric, text, text),
  public.paquete_borrar(uuid), public.paquete_set_alumnos(uuid, uuid[]),
  public.acceso_set_exigido(boolean), public.mi_acceso(), public.acceso_resumen(),
  public.paquetes_con_uso() from public, anon;
grant execute on function public.puede_ver_paquete(uuid), public.soy_admin(),
  public.paquete_guardar(uuid, text, uuid, integer, date, date, numeric, text, text),
  public.paquete_borrar(uuid), public.paquete_set_alumnos(uuid, uuid[]),
  public.acceso_set_exigido(boolean), public.mi_acceso(), public.acceso_resumen(),
  public.paquetes_con_uso() to authenticated;