-- El periodo que cubre cada cobro, editable de punta a punta.
--
-- Hasta acá un cobro de un plan cubría siempre un periodo del calendario (el
-- mes, o el trimestre…) y la corrida diaria decidía si ya estaba emitido
-- mirando SOLO el día en que arranca (índice único suscripcion_id +
-- periodo_inicio). Con eso no se podía decir «ya pagó hasta el 20», ni cobrar
-- solo los días que quedan, ni pagar un periodo a la medida: cualquier cobro
-- que no arrancara el día 1 dejaba el mes «libre» y la corrida lo volvía a
-- cobrar entero.
--
-- Ahora la pregunta de la corrida es «¿qué parte de este periodo ya está
-- cubierta?», y la cubren dos cosas: los cobros de esa suscripción (cualquiera
-- que se cruce con el periodo, también los anulados: anular un mes sigue
-- queriendo decir «este mes no se cobra») y `suscripciones.pagado_hasta`.
--   - Cubierto entero: no se emite nada.
--   - Cubierto a medias: según `suscripciones.medio_periodo`, se cobran solo
--     los días que faltan (proporcional) o se espera al periodo siguiente.
--   - Nada cubierto: el cobro de siempre, con el mismo concepto de siempre.
--
-- Y que dos cobros vigentes de un mismo plan no cubran el mismo día lo
-- garantiza una restricción de exclusión, no un if.

create extension if not exists btree_gist with schema extensions;

-- ------------------------------------------------------------ suscripciones
alter table public.suscripciones
  add column pagado_hasta date,
  add column medio_periodo text not null default 'proporcional';

alter table public.suscripciones
  add constraint suscripciones_medio_periodo_check
    check (medio_periodo in ('proporcional', 'siguiente'));

comment on column public.suscripciones.pagado_hasta is
  'Lo que ya está pagado (o no se cobra) hasta ese día, incluido: la corrida no emite nada que caiga antes.';
comment on column public.suscripciones.medio_periodo is
  'Si lo cubierto termina a mitad de un periodo: proporcional = se cobran solo los días que faltan; siguiente = se empieza a cobrar en el periodo siguiente.';

-- ------------------------------------------------- dos cobros, el mismo día
-- Solo entre cobros vigentes de un mismo plan: uno anulado no cobra nada, y un
-- cobro suelto (sin plan: una inscripción, un torneo) no cubre ningún periodo.
alter table public.cobros
  add constraint cobros_sin_periodos_cruzados
  exclude using gist (suscripcion_id with =, daterange(periodo_inicio, periodo_fin, '[]') with &&)
  where (estado = 'emitido' and suscripcion_id is not null);

-- -------------------------------------------------------- el periodo en palabras
-- «octubre 2026», «octubre a diciembre 2026», «21 al 31 de octubre 2026»,
-- «15 de octubre al 14 de noviembre 2026». Una sola copia: la usan la corrida,
-- el pago a la medida y la cotización que pinta la página.
create or replace function public.rango_es(p_desde date, p_hasta date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_desde = date_trunc('month', p_desde)::date
     and p_hasta = (date_trunc('month', p_hasta) + interval '1 month' - interval '1 day')::date then
      case
        when date_trunc('month', p_desde) = date_trunc('month', p_hasta)
          then public.mes_es(p_desde) || ' ' || extract(year from p_desde)::int
        when extract(year from p_desde) = extract(year from p_hasta)
          then public.mes_es(p_desde) || ' a ' || public.mes_es(p_hasta) || ' ' || extract(year from p_hasta)::int
        else public.mes_es(p_desde) || ' ' || extract(year from p_desde)::int
             || ' a ' || public.mes_es(p_hasta) || ' ' || extract(year from p_hasta)::int
      end
    when p_desde = p_hasta
      then extract(day from p_desde)::int || ' de ' || public.mes_es(p_desde) || ' ' || extract(year from p_desde)::int
    when date_trunc('month', p_desde) = date_trunc('month', p_hasta)
      then extract(day from p_desde)::int || ' al ' || extract(day from p_hasta)::int
           || ' de ' || public.mes_es(p_hasta) || ' ' || extract(year from p_hasta)::int
    when extract(year from p_desde) = extract(year from p_hasta)
      then extract(day from p_desde)::int || ' de ' || public.mes_es(p_desde)
           || ' al ' || extract(day from p_hasta)::int || ' de ' || public.mes_es(p_hasta)
           || ' ' || extract(year from p_hasta)::int
    else extract(day from p_desde)::int || ' de ' || public.mes_es(p_desde) || ' ' || extract(year from p_desde)::int
         || ' al ' || extract(day from p_hasta)::int || ' de ' || public.mes_es(p_hasta) || ' ' || extract(year from p_hasta)::int
  end;
$$;

revoke execute on function public.rango_es(date, date) from public, anon;
grant execute on function public.rango_es(date, date) to authenticated;

-- ------------------------------------------------- cuánto vale un rango de días
-- Cada periodo del plan (alineado al mes de inicio de la suscripción, como en
-- la corrida) que se cruce con el rango aporta su precio por la fracción de
-- sus días que cae adentro. Un mes entero vale un mes; del 21 al 31 de
-- octubre, 11/31 de un mes.
create or replace function interno.monto_rango(p_base date, p_meses integer, p_precio numeric,
                                               p_desde date, p_hasta date)
returns numeric
language sql
immutable
set search_path = ''
as $$
  with inicio as (
    select (p_base + make_interval(months => p_meses * floor(
             ((extract(year from p_desde) - extract(year from p_base)) * 12
              + extract(month from p_desde) - extract(month from p_base)) / p_meses)::int))::date as d
  ),
  periodos as (
    select g::date as pi, (g + make_interval(months => p_meses) - interval '1 day')::date as pf
      from inicio, generate_series(inicio.d::timestamp, p_hasta::timestamp, make_interval(months => p_meses)) g
  )
  select coalesce(round(sum(p_precio * (least(p_hasta, pf) - greatest(p_desde, pi) + 1)::numeric
                                     / (pf - pi + 1)), 2), 0)
    from periodos
   where pf >= p_desde and pi <= p_hasta;
$$;

revoke execute on function interno.monto_rango(date, integer, numeric, date, date) from public, anon, authenticated;

create or replace function interno.validar_periodo(p_desde date, p_hasta date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_desde is null or p_hasta is null then
    raise exception 'Falta de qué día a qué día cubre.' using errcode = '22023';
  end if;
  if p_hasta < p_desde then
    raise exception 'El periodo termina antes de empezar: revisa las dos fechas.' using errcode = '22023';
  end if;
  if p_hasta > p_desde + interval '3 years' then
    raise exception 'Un periodo puede cubrir hasta tres años.' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function interno.validar_periodo(date, date) from public, anon, authenticated;

-- ------------------------------------------------------------- la corrida
create or replace function interno.emitir_cobros(p_hasta date, p_suscripcion uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creados integer := 0;
begin
  with pasos as (
    select s.id, s.student_id, s.dia_cobro, s.descuento_pct, s.fin, s.pagado_hasta, s.medio_periodo,
           p.nombre, p.monto, p.moneda,
           case p.periodicidad when 'mensual'    then 1
                               when 'trimestral' then 3
                               when 'semestral'  then 6
                               else 12 end                       as meses,
           -- El periodo arranca en el mes de inicio, no el día exacto: la
           -- mensualidad de quien entra el 20 cubre ese mes completo (para
           -- cobrarle solo los días que quedan está `pagado_hasta`).
           date_trunc('month', s.inicio)::date                   as base
    from public.suscripciones s
    join public.planes_cobro p on p.id = s.plan_id
    where s.activa and p.activo
      and (p_suscripcion is null or s.id = p_suscripcion)
  ),
  periodos as (
    select x.*, g::date as p_ini,
           (g + make_interval(months => x.meses) - interval '1 day')::date as p_fin
    from pasos x,
         lateral generate_series(
           x.base::timestamp,
           least(p_hasta, coalesce(x.fin, p_hasta))::timestamp,
           make_interval(months => x.meses)
         ) g
  ),
  -- Hasta qué día de este periodo ya hay algo que lo cubre: lo pagado de
  -- antes o cualquier cobro del plan que se le cruce (también uno anulado).
  cubiertos as (
    select pe.*,
           greatest(
             case when pe.pagado_hasta >= pe.p_ini then pe.pagado_hasta end,
             (select max(c.periodo_fin) from public.cobros c
               where c.suscripcion_id = pe.id
                 and c.periodo_inicio <= pe.p_fin
                 and c.periodo_fin >= pe.p_ini)
           ) as cubierto
    from periodos pe
  ),
  a_emitir as (
    select cu.*,
           case when cu.cubierto is null then cu.p_ini else cu.cubierto + 1 end as desde
    from cubiertos cu
    where cu.cubierto is null
       or (cu.cubierto < cu.p_fin
           and cu.medio_periodo = 'proporcional'
           and (cu.fin is null or cu.cubierto < cu.fin))
  )
  insert into public.cobros (student_id, suscripcion_id, concepto, periodo_inicio,
                             periodo_fin, monto, moneda, vence, creado_por)
  select
    ae.student_id,
    ae.id,
    case when ae.desde = ae.p_ini then
      ae.nombre || ' · ' || public.mes_es(ae.p_ini)
        || ' ' || extract(year from ae.p_ini)::int
        || case when ae.meses > 1
                then ' a ' || public.mes_es(ae.p_fin) || ' ' || extract(year from ae.p_fin)::int
                else '' end
    else
      ae.nombre || ' · ' || public.rango_es(ae.desde, ae.p_fin) || ' (proporcional)'
    end,
    ae.desde,
    ae.p_fin,
    case when ae.desde = ae.p_ini
         then round(ae.monto * (1 - ae.descuento_pct / 100), 2)
         else round(ae.monto * (1 - ae.descuento_pct / 100)
                    * (ae.p_fin - ae.desde + 1) / (ae.p_fin - ae.p_ini + 1), 2)
    end,
    ae.moneda,
    -- El día pedido, o el último del mes si ese mes no lo tiene (31 en
    -- abril); y nunca antes del primer día que cubre el cobro.
    greatest(ae.desde,
             least(ae.p_ini + (ae.dia_cobro - 1),
                   (ae.p_ini + interval '1 month' - interval '1 day')::date)),
    auth.uid()
  from a_emitir ae
  on conflict (suscripcion_id, periodo_inicio) where suscripcion_id is not null
  do nothing;

  get diagnostics v_creados = row_count;
  return v_creados;
end;
$$;

-- -------------------------------------------------- cotizar un periodo a la medida
-- Lo que la página propone (concepto y monto) antes de registrar un pago de
-- un periodo a la medida, y con qué cobro vigente del plan se cruzaría. Pide
-- el mismo permiso que registrarlo.
create or replace function public.cobro_cotizar(p_suscripcion uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s record;
  v_monto numeric;
  v_choca text;
begin
  select su.student_id, su.inicio, su.descuento_pct, pl.nombre, pl.monto as precio, pl.moneda, pl.periodicidad
    into s
    from public.suscripciones su join public.planes_cobro pl on pl.id = su.plan_id
   where su.id = p_suscripcion;
  if not found then raise exception 'Ese plan no existe.' using errcode = 'P0002'; end if;
  if not coalesce(public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(s.student_id), false) then
    raise exception 'Ese alumno no es de tu coordinación.' using errcode = '42501';
  end if;
  perform interno.validar_periodo(p_desde, p_hasta);

  v_monto := interno.monto_rango(
    date_trunc('month', s.inicio)::date,
    case s.periodicidad when 'mensual' then 1 when 'trimestral' then 3 when 'semestral' then 6 else 12 end,
    s.precio * (1 - s.descuento_pct / 100), p_desde, p_hasta);

  select string_agg(c.concepto, ', ' order by c.periodo_inicio) into v_choca
    from public.cobros c
   where c.suscripcion_id = p_suscripcion and c.estado = 'emitido'
     and c.periodo_inicio <= p_hasta and c.periodo_fin >= p_desde;

  return jsonb_build_object(
    'concepto', s.nombre || ' · ' || public.rango_es(p_desde, p_hasta),
    'monto', v_monto,
    'moneda', s.moneda,
    'se_cruza_con', v_choca);
end;
$$;

revoke execute on function public.cobro_cotizar(uuid, date, date) from public, anon;
grant execute on function public.cobro_cotizar(uuid, date, date) to authenticated;

-- ------------------------------------------ un pago sin cobro previo, con su periodo
-- La función nueva lleva otro nombre, y la de siempre queda como una línea que
-- la llama: con el mismo nombre y dos firmas, PostgREST elegiría una según
-- los parámetros que lleguen (ver paquete_guardar). Así la regla vive en un
-- solo lugar y lo que ya llamaba a registrar_cobro_pagado() sigue igual.
create or replace function public.registrar_cobro_pagado_con_periodo(
  p_alumno uuid, p_concepto text, p_monto numeric, p_moneda text, p_metodo text,
  p_referencia text default null, p_nota text default null, p_fecha date default null,
  p_suscripcion uuid default null, p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date);
  v_cobro uuid;
  v_dueno uuid;
  v_cotiza jsonb;
  v_concepto text := btrim(coalesce(p_concepto, ''));
  v_monto numeric := p_monto;
  v_moneda text := coalesce(p_moneda, 'CRC');
begin
  if not coalesce(public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(p_alumno), false) then
    raise exception 'Ese alumno no es de tu coordinación.' using errcode = '42501';
  end if;
  if (p_desde is null) <> (p_hasta is null) then
    raise exception 'Falta una de las dos fechas del periodo.' using errcode = '22023';
  end if;

  if p_suscripcion is not null then
    -- Un periodo a la medida de un plan: cubre esos días de ESE plan, así que
    -- la corrida diaria ya no los vuelve a cobrar.
    select student_id into v_dueno from public.suscripciones where id = p_suscripcion;
    if v_dueno is distinct from p_alumno then
      raise exception 'Ese plan no es de ese alumno.' using errcode = '22023';
    end if;
    if p_desde is null then
      raise exception 'Di de qué día a qué día cubre este pago.' using errcode = '22023';
    end if;
    v_cotiza := public.cobro_cotizar(p_suscripcion, p_desde, p_hasta);
    if v_cotiza->>'se_cruza_con' is not null then
      raise exception 'Esos días ya están en otro cobro de este plan (%). Paga ese cobro, o anúlalo o corrige su periodo primero.',
        v_cotiza->>'se_cruza_con' using errcode = '22023';
    end if;
    v_moneda := v_cotiza->>'moneda';     -- la del plan, siempre
    if v_concepto = '' then v_concepto := v_cotiza->>'concepto'; end if;
    if v_monto is null then v_monto := (v_cotiza->>'monto')::numeric; end if;
  elsif p_desde is not null then
    perform interno.validar_periodo(p_desde, p_hasta);
  end if;

  if length(v_concepto) not between 1 and 200 then
    raise exception 'Escribe qué se paga.' using errcode = '22023';
  end if;
  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  begin
    insert into public.cobros (student_id, suscripcion_id, concepto, periodo_inicio, periodo_fin,
                               monto, moneda, vence, creado_por)
    values (p_alumno, p_suscripcion, v_concepto, coalesce(p_desde, v_fecha), coalesce(p_hasta, v_fecha),
            v_monto, v_moneda, v_fecha, auth.uid())
    returning id into v_cobro;
  exception when exclusion_violation or unique_violation then
    raise exception 'Esos días ya están en otro cobro de este plan. Paga ese cobro, o anúlalo o corrige su periodo primero.'
      using errcode = '22023';
  end;

  return interno.pagar(jsonb_build_array(jsonb_build_object('cobro_id', v_cobro, 'monto', v_monto)),
                       p_metodo, p_referencia, p_nota, v_fecha);
end;
$$;

revoke execute on function public.registrar_cobro_pagado_con_periodo(uuid, text, numeric, text, text, text, text, date, uuid, date, date) from public, anon;
grant execute on function public.registrar_cobro_pagado_con_periodo(uuid, text, numeric, text, text, text, text, date, uuid, date, date) to authenticated;

create or replace function public.registrar_cobro_pagado(
  p_alumno uuid, p_concepto text, p_monto numeric, p_moneda text, p_metodo text,
  p_referencia text default null, p_nota text default null, p_fecha date default null)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.registrar_cobro_pagado_con_periodo(p_alumno, p_concepto, p_monto, p_moneda, p_metodo,
                                                   p_referencia, p_nota, p_fecha, null, null, null);
$$;
