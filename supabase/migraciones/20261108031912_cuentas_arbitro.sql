-- Las cuentas de árbitro: una cuenta que solo usa herramientas de arbitraje.
--
-- La pidió el dueño (8/11/2026): «crear usuarios a árbitros y poder elegir qué
-- herramientas pueden usar, al igual que alumnos pero exclusivo de árbitros».
-- Lo que eligió: las crea administración Y cada organizador (quien tiene una
-- licencia propia), que solo puede dar las herramientas que él mismo tiene y
-- solo ve a sus árbitros; el árbitro entra con usuario y contraseña (sin
-- correo); y al entrar ve solo sus herramientas, nada de la Academia.
--
-- Cómo se arma, sin una puerta nueva para cada herramienta:
--
-- 1. `profiles.role` acepta 'arbitro'. Un árbitro no es alumno: no sale en
--    ninguna lista de alumnos (todas filtran por role = 'alumno' o por
--    profile_teachers) y `acceso_vigente()` le dice que NO, así que las
--    políticas restrictivas de la Academia (progreso, clase, exámenes) y el
--    candado de los cursos del worker lo dejan afuera. `mi_acceso()` dice
--    'arbitro' y js/acceso-vigente.js lo manda a su panel (arbitro.html).
-- 2. Las herramientas de un árbitro son LICENCIAS de siempre
--    (licencias_herramientas), puestas en su cuenta, con `otorgada_por` = quien
--    se la dio. Así todo lo que ya pregunta `tengo_herramienta()` —el candado
--    de cada página, las Edge Functions, el worker— lo atiende sin cambiar.
-- 3. Una licencia DADA vale solo mientras quien la dio la siga teniendo
--    (`interno.herramienta_propia`): si al organizador se le vence o se le
--    anula la suya, a sus árbitros se les apaga en el mismo momento, sin que
--    nadie tenga que acordarse. Una sola vuelta: un árbitro no da licencias.
-- 4. `arbitros_cuentas` dice de quién es cada árbitro. No tiene política de
--    escritura: la escribe la Edge Function `arbitro-cuentas` (con la clave de
--    servicio, después de preguntarle a la base con el token de quien llama si
--    puede) y la lleva el trigger de la bitácora.
-- 5. `arbitro_herramientas_fijar()` deja la lista EXACTAMENTE como llega
--    (regla de las funciones set_*), pero solo entre las herramientas que quien
--    llama puede dar: lo que puso administración y el organizador no tiene no
--    se lo puede quitar por no verlo en su pantalla.
--
-- Ver «Las cuentas de árbitro» en docs/decisiones/permisos-y-roles.md.

-- ---------------------------------------------------------------- 1. el rol
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['profesor'::text, 'alumno'::text, 'admin'::text, 'arbitro'::text]));

-- ---------------------------------------------------------------- 2. quién la dio
alter table public.licencias_herramientas
  add column otorgada_por uuid references public.profiles(id) on delete cascade;
comment on column public.licencias_herramientas.otorgada_por is
  'La licencia que un organizador (o administración) le dio a una cuenta de árbitro. Vale solo mientras quien la dio tenga la herramienta (interno.herramienta_propia). null = licencia propia, comprada o puesta por administración.';
create index licencias_herramientas_otorgada_por_idx on public.licencias_herramientas (otorgada_por);

-- ---------------------------------------------------------------- 3. de quién es cada árbitro
create table public.arbitros_cuentas (
  arbitro_id uuid primary key references public.profiles(id) on delete cascade,
  organizador_id uuid references public.profiles(id) on delete set null,
  creada_en timestamptz not null default now()
);
comment on table public.arbitros_cuentas is
  'Las cuentas de árbitro y quién las creó (el organizador; null si su cuenta se borró: la ve administración). La escribe solo la Edge Function arbitro-cuentas.';
create index arbitros_cuentas_organizador_idx on public.arbitros_cuentas (organizador_id);

alter table public.arbitros_cuentas enable row level security;
revoke all on public.arbitros_cuentas from public, anon, authenticated;
grant select on public.arbitros_cuentas to authenticated;
create policy arbitros_cuentas_ver on public.arbitros_cuentas
  for select to authenticated
  using (organizador_id = (select auth.uid()) or arbitro_id = (select auth.uid()) or (select public.soy_admin()));

create trigger auditar after insert or update or delete on public.arbitros_cuentas
  for each row execute function interno.auditar();

-- ---------------------------------------------------------------- 4. la licencia propia
-- ¿Esta persona tiene la herramienta por sí misma (administración, o una
-- licencia que no le dio nadie)? Es lo que sostiene a las licencias dadas.
create or replace function interno.herramienta_propia(p_persona uuid, p_herramienta text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(
    exists (select 1 from public.profiles pr where pr.id = p_persona and coalesce(pr.is_admin, false))
    or exists (
      select 1 from public.licencias_herramientas l
       where l.persona_id = p_persona
         and l.otorgada_por is null
         and not l.revocada
         and l.activada_en is not null
         and l.herramienta in (p_herramienta, 'todas')
         and (l.vence is null or l.vence > now())), false);
$function$;
revoke execute on function interno.herramienta_propia(uuid, text) from public, anon, authenticated;

-- El candado de todas las herramientas: ahora también con las dadas.
create or replace function public.tengo_herramienta(p_herramienta text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(public.soy_admin(), false) or exists (
    select 1 from public.licencias_herramientas l
     where l.persona_id = auth.uid()
       and not l.revocada
       and l.activada_en is not null
       and l.herramienta in (p_herramienta, 'todas')
       and (l.vence is null or l.vence > now())
       and (l.otorgada_por is null or interno.herramienta_propia(l.otorgada_por, p_herramienta)));
$function$;
revoke execute on function public.tengo_herramienta(text) from public, anon;
grant execute on function public.tengo_herramienta(text) to authenticated;

-- Las herramientas que tiene la cuenta que llama, en una sola pregunta (el
-- panel del árbitro). 'todas' = todas; administración, ['todas'].
create or replace function public.mis_herramientas()
 returns text[]
 language sql
 stable security definer
 set search_path to ''
as $function$
  select case when coalesce(public.soy_admin(), false) then array['todas']::text[]
    else coalesce((
      select array_agg(distinct l.herramienta order by l.herramienta)
        from public.licencias_herramientas l
       where l.persona_id = (select auth.uid())
         and not l.revocada
         and l.activada_en is not null
         and (l.vence is null or l.vence > now())
         and (l.otorgada_por is null or interno.herramienta_propia(l.otorgada_por, l.herramienta))), '{}'::text[])
  end;
$function$;
revoke execute on function public.mis_herramientas() from public, anon;
grant execute on function public.mis_herramientas() to authenticated;

-- Las herramientas que la cuenta que llama puede DAR a sus árbitros: las suyas
-- propias. Vacío = no puede crear árbitros (sin licencia propia, o es árbitro).
create or replace function public.arbitros_puedo_dar()
 returns text[]
 language sql
 stable security definer
 set search_path to ''
as $function$
  select case
    when (select auth.uid()) is null then '{}'::text[]
    when coalesce(public.soy_admin(), false) then array['todas']::text[]
    when exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.role = 'arbitro') then '{}'::text[]
    when exists (select 1 from public.licencias_herramientas l
                  where l.persona_id = (select auth.uid()) and l.otorgada_por is null and not l.revocada
                    and l.activada_en is not null and l.herramienta = 'todas'
                    and (l.vence is null or l.vence > now())) then array['todas']::text[]
    else coalesce((
      select array_agg(distinct l.herramienta order by l.herramienta)
        from public.licencias_herramientas l
       where l.persona_id = (select auth.uid())
         and l.otorgada_por is null
         and not l.revocada
         and l.activada_en is not null
         and (l.vence is null or l.vence > now())), '{}'::text[])
  end;
$function$;
revoke execute on function public.arbitros_puedo_dar() from public, anon;
grant execute on function public.arbitros_puedo_dar() to authenticated;

-- ---------------------------------------------------------------- 5. mis árbitros
-- Los árbitros de quien llama (administración: todos), con lo que puede usar
-- cada uno. `pausadas`: dadas por alguien que ya no tiene la herramienta.
create or replace function public.arbitros_mis()
 returns table (arbitro_id uuid, nombre text, usuario text, organizador_id uuid, organizador text,
                creada_en timestamptz, ultima_entrada timestamptz, herramientas text[], pausadas text[])
 language sql
 stable security definer
 set search_path to ''
as $function$
  select a.arbitro_id, p.full_name, p.email, a.organizador_id, o.full_name, a.creada_en, u.last_sign_in_at,
         coalesce((select array_agg(distinct l.herramienta order by l.herramienta)
                     from public.licencias_herramientas l
                    where l.persona_id = a.arbitro_id and l.otorgada_por is not null and not l.revocada
                      and l.activada_en is not null and (l.vence is null or l.vence > now())
                      and interno.herramienta_propia(l.otorgada_por, l.herramienta)), '{}'::text[]),
         coalesce((select array_agg(distinct l.herramienta order by l.herramienta)
                     from public.licencias_herramientas l
                    where l.persona_id = a.arbitro_id and l.otorgada_por is not null and not l.revocada
                      and l.activada_en is not null and (l.vence is null or l.vence > now())
                      and not interno.herramienta_propia(l.otorgada_por, l.herramienta)), '{}'::text[])
    from public.arbitros_cuentas a
    join public.profiles p on p.id = a.arbitro_id
    left join public.profiles o on o.id = a.organizador_id
    left join auth.users u on u.id = a.arbitro_id
   where (select auth.uid()) is not null
     and (coalesce(public.soy_admin(), false) or a.organizador_id = (select auth.uid()))
   order by lower(coalesce(p.full_name, p.email));
$function$;
revoke execute on function public.arbitros_mis() from public, anon;
grant execute on function public.arbitros_mis() to authenticated;

-- Deja las herramientas de un árbitro EXACTAMENTE como llegan, entre las que
-- quien llama puede dar. Devuelve las que quedaron.
create or replace function public.arbitro_herramientas_fijar(p_arbitro uuid, p_herramientas text[])
 returns text[]
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_yo uuid := (select auth.uid());
  v_admin boolean := coalesce(public.soy_admin(), false);
  v_dar text[];
  v_todas boolean;
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
  v_dar := public.arbitros_puedo_dar();
  if coalesce(cardinality(v_dar), 0) = 0 then
    raise exception 'Para dar herramientas hace falta tener la licencia de alguna.' using errcode = '42501';
  end if;
  v_todas := 'todas' = any (v_dar);
  select coalesce(array_agg(distinct x), '{}'::text[]) into v_pedidas
    from unnest(coalesce(p_herramientas, '{}'::text[])) x where x is not null;
  if cardinality(v_pedidas) > 60 then
    raise exception 'Son demasiadas herramientas de una vez.' using errcode = '22023';
  end if;
  foreach h in array v_pedidas loop
    if h !~ '^[a-z0-9-]{2,40}$' then
      raise exception 'Esa herramienta no existe: %', h using errcode = '22023';
    end if;
    if h = 'todas' and not v_admin then
      raise exception 'Solo administración da «todas las herramientas»; marca cada una.' using errcode = '42501';
    end if;
    if not (v_todas or h = any (v_dar)) then
      raise exception 'No puedes dar «%»: tú no tienes su licencia.', h using errcode = '42501';
    end if;
  end loop;

  -- Se quitan las dadas que ya no están en la lista (solo las que yo podría dar).
  update public.licencias_herramientas l set revocada = true
   where l.persona_id = p_arbitro and l.otorgada_por is not null and not l.revocada
     and not (l.herramienta = any (v_pedidas))
     and (v_todas or l.herramienta = any (v_dar));

  -- Se ponen las que faltan (o las que quedaron colgando de alguien que ya no las tiene).
  insert into public.licencias_herramientas (codigo, herramienta, dias, nota, persona_id, activada_en, vence, revocada, creada_por, otorgada_por)
  select 'AI-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-'
              || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-'
              || upper(substr(md5(gen_random_uuid()::text), 1, 4)),
         x, null, 'Cuenta de árbitro', p_arbitro, now(), null, false, v_yo, v_yo
    from unnest(v_pedidas) x
   where not exists (select 1 from public.licencias_herramientas l
                      where l.persona_id = p_arbitro and l.otorgada_por is not null and not l.revocada
                        and l.herramienta = x and l.activada_en is not null
                        and (l.vence is null or l.vence > now())
                        and interno.herramienta_propia(l.otorgada_por, x));

  -- Se vuelve a LEER lo que quedó (no se devuelve lo pedido).
  return coalesce((select array_agg(distinct l.herramienta order by l.herramienta)
                     from public.licencias_herramientas l
                    where l.persona_id = p_arbitro and l.otorgada_por is not null and not l.revocada
                      and l.activada_en is not null and (l.vence is null or l.vence > now())
                      and interno.herramienta_propia(l.otorgada_por, l.herramienta)), '{}'::text[]);
end;
$function$;
revoke execute on function public.arbitro_herramientas_fijar(uuid, text[]) from public, anon;
grant execute on function public.arbitro_herramientas_fijar(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------- 6. fuera de la Academia
create or replace function public.acceso_vigente()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  select case
    when auth.uid() is null then true
    -- La cuenta de árbitro solo usa herramientas: la Academia, nunca.
    when exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'arbitro') then false
    when not exists (select 1 from public.profiles pr
                      where pr.id = auth.uid() and pr.role = 'alumno' and not coalesce(pr.is_admin, false)) then true
    when exists (select 1 from public.cuentas_temporales t where t.persona_id = auth.uid()) then
      exists (select 1 from public.cuentas_temporales t where t.persona_id = auth.uid() and t.vence > now())
      or exists (
        select 1 from public.paquete_alumnos pa
          join public.paquetes_acceso p on p.id = pa.paquete_id
         where pa.alumno_id = auth.uid()
           and p.vigente_desde <= (now() at time zone 'America/Costa_Rica')::date
           and p.vigente_hasta >= (now() at time zone 'America/Costa_Rica')::date)
    when exists (select 1 from public.pruebas_gratis g where g.alumno_id = auth.uid()) then
      exists (select 1 from public.pruebas_gratis g where g.alumno_id = auth.uid() and g.vence > now())
      or exists (
        select 1 from public.paquete_alumnos pa
          join public.paquetes_acceso p on p.id = pa.paquete_id
         where pa.alumno_id = auth.uid()
           and p.vigente_desde <= (now() at time zone 'America/Costa_Rica')::date
           and p.vigente_hasta >= (now() at time zone 'America/Costa_Rica')::date)
    when not coalesce((select c.exigido from public.acceso_config c where c.id), false) then true
    else exists (
      select 1 from public.paquete_alumnos pa
        join public.paquetes_acceso p on p.id = pa.paquete_id
       where pa.alumno_id = auth.uid()
         and p.vigente_desde <= (now() at time zone 'America/Costa_Rica')::date
         and p.vigente_hasta >= (now() at time zone 'America/Costa_Rica')::date)
  end;
$function$;

create or replace function public.mi_acceso()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_rol text; v_admin boolean; v_exigido boolean; v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
        v_hasta date; v_nombre text; v_vigente boolean := public.acceso_vigente(); v_prueba timestamptz;
        v_temporal timestamptz; v_detalle text; v_empieza timestamptz; v_origen text;
begin
  select role, is_admin into v_rol, v_admin from public.profiles where id = auth.uid();
  select exigido into v_exigido from public.acceso_config where id;
  v_exigido := coalesce(v_exigido, false);
  if v_rol is null then
    return jsonb_build_object('vigente', v_vigente, 'motivo', 'sin_perfil', 'exigido', v_exigido);
  end if;
  -- La cuenta de árbitro: su lugar es arbitro.html (js/acceso-vigente.js lo lleva).
  if v_rol = 'arbitro' then
    return jsonb_build_object('vigente', false, 'motivo', 'arbitro', 'exigido', v_exigido);
  end if;
  if coalesce(v_admin, false) or v_rol <> 'alumno' then
    return jsonb_build_object('vigente', v_vigente, 'motivo', 'equipo', 'exigido', v_exigido);
  end if;
  select p.vigente_hasta, p.nombre into v_hasta, v_nombre
    from public.paquete_alumnos pa join public.paquetes_acceso p on p.id = pa.paquete_id
   where pa.alumno_id = auth.uid() and p.vigente_desde <= v_hoy
   order by p.vigente_hasta desc limit 1;
  if v_hasta is not null and v_hasta >= v_hoy then
    return jsonb_build_object('vigente', v_vigente, 'motivo', 'paquete', 'exigido', v_exigido,
      'hasta', v_hasta, 'dias', v_hasta - v_hoy, 'paquete', v_nombre);
  end if;
  select t.vence, t.detalle into v_temporal, v_detalle from public.cuentas_temporales t where t.persona_id = auth.uid();
  if v_temporal is not null then
    return jsonb_build_object('vigente', v_vigente,
      'motivo', case when v_temporal > now() then 'temporal' else 'temporal_vencida' end,
      'exigido', v_exigido, 'vence', v_temporal, 'detalle', v_detalle,
      'dias', greatest(0, (v_temporal at time zone 'America/Costa_Rica')::date - v_hoy));
  end if;
  select g.vence, g.empieza, g.origen into v_prueba, v_empieza, v_origen from public.pruebas_gratis g where g.alumno_id = auth.uid();
  if v_prueba is not null then
    return jsonb_build_object('vigente', v_vigente,
      'motivo', case when v_prueba > now() then 'prueba' else 'prueba_vencida' end,
      'exigido', v_exigido, 'vence', v_prueba,
      'horas', greatest(0, ceil(extract(epoch from (v_prueba - now())) / 3600))::int,
      'origen', v_origen,
      'dias_total', round(extract(epoch from (v_prueba - v_empieza)) / 86400)::int);
  end if;
  return jsonb_build_object('vigente', v_vigente,
    'motivo', case when not v_exigido then 'sin_exigir' when v_hasta is null then 'sin_paquete' else 'vencido' end,
    'exigido', v_exigido, 'hasta', v_hasta, 'paquete', v_nombre);
end $function$;
