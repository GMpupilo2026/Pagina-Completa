-- Las cuentas temporales: una cuenta de alumno que se cierra sola en una fecha.
--
-- La primera la pidió el taller «Formación Ajedrez» para los asesores
-- regionales del MEP: 27 cuentas que valen hasta el 20 de diciembre de 2026.
-- La prueba gratis ya cerraba una cuenta en una fecha, pero dice lo que es
-- —«Tu prueba gratis de 3 días terminó», con la salida a los precios— y
-- `prueba_gratis_activar()` solo acepta una cuenta recién creada con su
-- aceptación legal. Esto es lo mismo con su nombre: quién, hasta cuándo y por
-- qué.
--
-- EL CORTE LO HACE LA BASE, IGUAL QUE CON LA PRUEBA: `acceso_vigente()`
-- pregunta por la cuenta temporal ANTES que por el interruptor del acceso. Con
-- el interruptor apagado una cuenta normal entra sin límite y la temporal no;
-- con el interruptor encendido, la temporal entra hasta su fecha aunque no
-- tenga paquete (vale como un paquete que termina ese día). Al vencer se le
-- cierran las políticas restrictivas, los tres triggers y el candado de los
-- cursos en el worker, sin que nada tenga que correr ese día. Con un paquete
-- vigente vuelve a entrar, como la prueba.
--
-- `mi_acceso()` dice «temporal» (con `vence`, `dias` y `detalle`) o
-- «temporal_vencida», y js/acceso-vigente.js pinta su propio aviso.
--
-- Ver «Las cuentas temporales» en docs/decisiones/cobros-acceso-y-tienda.md.

-- ---- la tabla ----
create table public.cuentas_temporales (
  persona_id uuid primary key references public.profiles(id) on delete cascade,
  vence timestamptz not null,
  detalle text not null check (char_length(btrim(detalle)) between 2 and 120),
  fijada_por uuid references public.profiles(id) on delete set null,
  fijada_en timestamptz not null default now()
);
comment on table public.cuentas_temporales is
  'Cuentas de alumno que se cierran solas en `vence` (acceso_vigente() las corta aunque acceso_config.exigido esté apagado, salvo con un paquete vigente). Solo la escribe cuentas_temporales_fijar() (administración).';
create index cuentas_temporales_fijada_por_idx on public.cuentas_temporales (fijada_por);

alter table public.cuentas_temporales enable row level security;
revoke all on public.cuentas_temporales from public, anon, authenticated;
grant select on public.cuentas_temporales to authenticated;
-- La persona ve la suya; quien administra, todas. Nadie escribe desde el
-- navegador: reparte acceso, así que la escribe una función que valida.
create policy cuentas_temporales_ver on public.cuentas_temporales
  for select to authenticated
  using (persona_id = (select auth.uid()) or (select public.soy_admin()));

create trigger auditar after insert or update or delete on public.cuentas_temporales
  for each row execute function interno.auditar();

-- ---- quién la escribe ----
-- Pone (o cambia) la fecha de corte de esas cuentas. Con `p_vence` en null la
-- quita: la cuenta vuelve a ser una cuenta normal. Solo alumnos: el corte de
-- acceso_vigente() no alcanza a quien da clase o administra, y una fila que
-- no corta nada sería una promesa falsa.
create or replace function public.cuentas_temporales_fijar(p_personas uuid[], p_vence timestamptz, p_detalle text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_lista uuid[] := coalesce(p_personas, '{}');
  n integer;
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo quien administra fija cuentas temporales.' using errcode = '42501';
  end if;
  if coalesce(array_length(v_lista, 1), 0) = 0 then
    return 0;
  end if;
  if array_length(v_lista, 1) > 5000 then
    raise exception 'Demasiadas cuentas de una vez (máximo 5000).';
  end if;

  if p_vence is null then
    delete from public.cuentas_temporales where persona_id = any(v_lista);
    get diagnostics n = row_count;
    return n;
  end if;

  if char_length(btrim(coalesce(p_detalle, ''))) < 2 then
    raise exception 'Hace falta decir por qué la cuenta es temporal (por ejemplo, el taller).';
  end if;
  if exists (select 1 from unnest(v_lista) as x(id)
               left join public.profiles p on p.id = x.id
              where p.id is null or p.role is distinct from 'alumno' or coalesce(p.is_admin, false)) then
    raise exception 'Solo una cuenta de alumno puede ser temporal: el corte no alcanza a quien da clase o administra.';
  end if;

  insert into public.cuentas_temporales (persona_id, vence, detalle, fijada_por)
  select distinct x.id, p_vence, left(btrim(p_detalle), 120), auth.uid()
    from unnest(v_lista) as x(id)
  on conflict (persona_id) do update
    set vence = excluded.vence, detalle = excluded.detalle,
        fijada_por = excluded.fijada_por, fijada_en = now();
  get diagnostics n = row_count;
  return n;
end;
$function$;
revoke execute on function public.cuentas_temporales_fijar(uuid[], timestamptz, text) from public, anon;
grant execute on function public.cuentas_temporales_fijar(uuid[], timestamptz, text) to authenticated;

-- ---- el candado ----
-- La cuenta temporal se pregunta ANTES que la prueba y que el interruptor.
create or replace function public.acceso_vigente()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  select case
    when auth.uid() is null then true
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

-- mi_acceso() dice además «temporal» (con `vence`, los `dias` de calendario
-- que quedan en hora de Costa Rica y el `detalle`) o «temporal_vencida». Con un
-- paquete vigente sigue diciendo «paquete».
create or replace function public.mi_acceso()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_rol text; v_admin boolean; v_exigido boolean; v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
        v_hasta date; v_nombre text; v_vigente boolean := public.acceso_vigente(); v_prueba timestamptz;
        v_temporal timestamptz; v_detalle text;
begin
  select role, is_admin into v_rol, v_admin from public.profiles where id = auth.uid();
  select exigido into v_exigido from public.acceso_config where id;
  v_exigido := coalesce(v_exigido, false);
  if v_rol is null then
    return jsonb_build_object('vigente', v_vigente, 'motivo', 'sin_perfil', 'exigido', v_exigido);
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
  select g.vence into v_prueba from public.pruebas_gratis g where g.alumno_id = auth.uid();
  if v_prueba is not null then
    return jsonb_build_object('vigente', v_vigente,
      'motivo', case when v_prueba > now() then 'prueba' else 'prueba_vencida' end,
      'exigido', v_exigido, 'vence', v_prueba,
      'horas', greatest(0, ceil(extract(epoch from (v_prueba - now())) / 3600))::int);
  end if;
  return jsonb_build_object('vigente', v_vigente,
    'motivo', case when not v_exigido then 'sin_exigir' when v_hasta is null then 'sin_paquete' else 'vencido' end,
    'exigido', v_exigido, 'hasta', v_hasta, 'paquete', v_nombre);
end $function$;
