-- Metropolitano 2026: lo del día del torneo y lo que necesita la organización.
--
-- 1. La acreditación: en la entrada se escanea el QR del gafete (o se busca
--    por el nombre, el código o la placa) y se marca que llegó
--    (acreditado_en, metropolitano_acreditar, solo administración).
-- 2. La logística en números: cuántos duermen cada noche, cuántas comidas por
--    día, las dietas, la accesibilidad y los traslados del aeropuerto
--    (metropolitano_logistica, solo administración; contado en la base).
-- 3. «¿Quién viene?»: los jugadores inscritos de cada torneo, para la página
--    del torneo (metropolitano_quien_viene, sin cuenta). Solo salen con su
--    nombre quienes dieron el permiso de publicidad; los demás solo cuentan.
-- Ver «La acreditación», «La logística en números» y «¿Quién viene?» en
-- docs/decisiones/cuentas-y-formularios.md.

alter table public.metropolitano_inscripciones
  add column acreditado_en timestamptz,
  add column acreditado_por uuid references public.profiles(id) on delete set null;

create or replace function public.metropolitano_acreditar(p_id uuid, p_llego boolean)
returns public.metropolitano_inscripciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.metropolitano_inscripciones;
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo administración acredita en la entrada.' using errcode = '42501';
  end if;
  update public.metropolitano_inscripciones
     set acreditado_en = case when p_llego then coalesce(acreditado_en, now()) end,
         acreditado_por = case when p_llego then coalesce(acreditado_por, auth.uid()) end
   where id = p_id and estado = 'activa';
  if not found then
    raise exception 'No existe esa inscripción, o está anulada.';
  end if;
  select * into v from public.metropolitano_inscripciones where id = p_id;
  return v;
end;
$$;
revoke execute on function public.metropolitano_acreditar(uuid, boolean) from public, anon;
grant execute on function public.metropolitano_acreditar(uuid, boolean) to authenticated;

-- La logística: las noches, las comidas de cada día (también las de los
-- titulados invitados, del día de llegada al de salida), las dietas, la
-- accesibilidad y los traslados. Cuenta lo activo con el pago no rechazado.
create or replace function public.metropolitano_logistica()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo administración ve la logística.' using errcode = '42501';
  end if;
  with act as (
    select m.*, 'MET-' || lpad(m.numero::text, 4, '0') codigo, m.nombre || ' ' || m.apellidos quien,
           m.rol = 'jugador' and m.titulo in ('GM', 'IM', 'WGM') titulado
      from public.metropolitano_inscripciones m
     where m.estado = 'activa' and m.pago_estado <> 'rechazado'),
  tit as (
    select a.*, (a.viaje->>'llegada')::date llega, (a.viaje->>'salida')::date sale
      from act a
     where a.titulado and coalesce(a.viaje->>'llegada', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       and coalesce(a.viaje->>'salida', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  dias as (select g::date d from generate_series(date '2026-12-20', date '2027-01-03', interval '1 day') g)
  select jsonb_build_object(
    'noches', (select jsonb_agg(jsonb_build_object('noche', d.d,
        'inscritos', (select count(*) from act a where a.hospedaje and a.hospedaje_desde <= d.d and d.d < a.hospedaje_hasta),
        'acompanantes', (select coalesce(sum(a.acompanantes), 0) from act a where a.hospedaje and a.hospedaje_desde <= d.d and d.d < a.hospedaje_hasta),
        'titulados', (select count(*) from tit t where t.llega <= d.d and d.d < t.sale)) order by d.d)
      from dias d where d.d < date '2027-01-03'),
    'comidas', (select jsonb_agg(jsonb_build_object('dia', d.d,
        'desayuno', (select count(*) from act a where 'desayuno' = any (a.comidas) and d.d between a.comidas_desde and a.comidas_hasta)
                    + (select count(*) from tit t where d.d between t.llega and t.sale),
        'almuerzo', (select count(*) from act a where 'almuerzo' = any (a.comidas) and d.d between a.comidas_desde and a.comidas_hasta)
                    + (select count(*) from tit t where d.d between t.llega and t.sale),
        'cena', (select count(*) from act a where 'cena' = any (a.comidas) and d.d between a.comidas_desde and a.comidas_hasta)
                + (select count(*) from tit t where d.d between t.llega and t.sale)) order by d.d)
      from dias d),
    'dietas', coalesce((select jsonb_agg(jsonb_build_object('codigo', a.codigo, 'quien', a.quien, 'delegacion', a.delegacion,
        'dieta', a.dieta, 'comidas', a.comidas, 'desde', a.comidas_desde, 'hasta', a.comidas_hasta, 'titulado', a.titulado) order by a.numero)
      from act a where a.dieta is not null), '[]'::jsonb),
    'accesibilidad', coalesce((select jsonb_agg(jsonb_build_object('codigo', a.codigo, 'quien', a.quien, 'delegacion', a.delegacion,
        'condicion', a.condicion, 'accesibilidad', a.accesibilidad, 'hospedaje', a.hospedaje) order by a.numero)
      from act a where cardinality(a.condicion) > 0 or a.accesibilidad is not null), '[]'::jsonb),
    'traslados', coalesce((select jsonb_agg(jsonb_build_object('codigo', a.codigo, 'quien', a.quien, 'delegacion', a.delegacion,
        'llegada', a.viaje->>'llegada', 'salida', a.viaje->>'salida', 'vuelo', a.viaje->>'vuelo', 'telefono', a.telefono,
        'titulado', a.titulado) order by a.viaje->>'llegada', a.numero)
      from act a where coalesce(a.viaje->>'traslado', '') = 'true'), '[]'::jsonb),
    'llegadas', coalesce((select jsonb_agg(jsonb_build_object('dia', x.dia, 'personas', x.n) order by x.dia)
      from (select a.viaje->>'llegada' dia, count(*) n from act a
             where coalesce(a.viaje->>'llegada', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and a.origen = 'fuera'
             group by 1) x), '[]'::jsonb)) into v;
  return v;
end;
$$;
revoke execute on function public.metropolitano_logistica() from public, anon;
grant execute on function public.metropolitano_logistica() to authenticated;

-- «¿Quién viene?»: los jugadores de cada torneo. Con su nombre, título,
-- federación y Elo solo quienes autorizaron el uso de su nombre en la
-- publicidad del torneo; el total los cuenta a todos. Nada más sale de aquí:
-- ni documentos, ni contactos, ni fotos.
create or replace function public.metropolitano_quien_viene()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with j as (
    select m.*, t
      from public.metropolitano_inscripciones m, unnest(m.torneos) t
     where m.estado = 'activa' and m.pago_estado <> 'rechazado' and m.rol = 'jugador')
  select coalesce(jsonb_object_agg(x.t, jsonb_build_object('total', x.total, 'lista', x.lista)), '{}'::jsonb)
    from (select j.t, count(*) total,
                 coalesce(jsonb_agg(jsonb_build_object('nombre', j.nombre || ' ' || j.apellidos, 'titulo', j.titulo,
                     'fed', coalesce(j.federacion, case when j.origen = 'cr' then 'CRC' end),
                     'elo', case when j.t = 'BLITZ' then j.elo_blitz else j.elo_estandar end,
                     'delegacion', coalesce(j.delegacion, j.club))
                   order by (case when j.t = 'BLITZ' then j.elo_blitz else j.elo_estandar end) desc nulls last, j.apellidos)
                   filter (where j.acepta_publicidad), '[]'::jsonb) lista
            from j group by j.t) x;
$$;
revoke execute on function public.metropolitano_quien_viene() from public;
grant execute on function public.metropolitano_quien_viene() to anon, authenticated;
