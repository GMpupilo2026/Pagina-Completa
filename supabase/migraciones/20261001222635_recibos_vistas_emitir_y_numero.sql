-- Recibos por academia (2 de 3): un recibo anulado deja de contar, la
-- vista de los recibos, emitir cobros con UNA sola regla y el número.

-- ------------------------------------- un recibo anulado deja de contar
create or replace view public.cobros_vista with (security_invoker = on) as
 select c.id,
    c.student_id,
    c.suscripcion_id,
    c.consecutivo,
    c.concepto,
    c.periodo_inicio,
    c.periodo_fin,
    c.monto,
    c.moneda,
    c.vence,
    c.estado,
    c.anulado_motivo,
    c.created_at,
    (coalesce(p.pagado, 0))::numeric(12,2) as pagado,
    ((c.monto - coalesce(p.pagado, 0)))::numeric(12,2) as saldo,
    p.ultimo_pago,
        case
            when c.estado = 'anulado' then 'anulado'
            when coalesce(p.pagado, 0) >= c.monto then 'pagado'
            when c.vence < current_date then 'vencido'
            else 'pendiente'
        end as situacion,
        case
            when c.estado = 'emitido' and c.vence < current_date and coalesce(p.pagado, 0) < c.monto
              then current_date - c.vence
            else 0
        end as dias_atraso
   from public.cobros c
     left join lateral (
       select sum(pg.monto) as pagado, max(pg.fecha) as ultimo_pago
         from public.pagos pg
        where pg.cobro_id = c.id
          and not exists (select 1 from public.recibos r where r.id = pg.recibo_id and r.estado = 'anulado')
     ) p on true;

-- El recibo con su total y lo que paga, para la lista y para el correo.
create or replace view public.recibos_vista with (security_invoker = on) as
select r.id, r.numero, r.academia_id, r.student_id, r.fecha, r.metodo, r.referencia, r.nota,
       r.estado, r.anulado_motivo, r.entrega, r.enviado_at, r.enviado_a, r.emitido_por, r.created_at,
       coalesce(t.total, 0)::numeric(12,2) as total,
       t.moneda,
       coalesce(t.detalle, '[]'::jsonb) as detalle
  from public.recibos r
  left join lateral (
    select sum(p.monto) as total, min(c.moneda) as moneda,
           jsonb_agg(jsonb_build_object('pago_id', p.id, 'cobro_id', c.id, 'concepto', c.concepto,
                                        'consecutivo', c.consecutivo, 'monto', p.monto,
                                        'periodo_inicio', c.periodo_inicio)
                     order by c.periodo_inicio, c.consecutivo) as detalle
      from public.pagos p join public.cobros c on c.id = p.cobro_id
     where p.recibo_id = r.id
  ) t on true;
revoke all on public.recibos_vista from anon;
grant select on public.recibos_vista to authenticated;

-- ------------------------------------------- emitir: UNA sola regla
-- El cuerpo de generar_cobros(), ahora con la posibilidad de acotarlo a una
-- suscripción: así el pago adelantado emite sus meses con la misma cuenta
-- (concepto, beca, día de vencimiento) que la corrida diaria.
create or replace function interno.emitir_cobros(p_hasta date, p_suscripcion uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_creados integer := 0;
begin
  with pasos as (
    select s.id, s.student_id, s.dia_cobro, s.descuento_pct, s.fin,
           p.nombre, p.monto, p.moneda,
           case p.periodicidad when 'mensual'    then 1
                               when 'trimestral' then 3
                               when 'semestral'  then 6
                               else 12 end                       as meses,
           -- El periodo arranca en el mes de inicio, no el día exacto: la
           -- mensualidad de quien entra el 20 cubre ese mes completo.
           date_trunc('month', s.inicio)::date                   as base
    from public.suscripciones s
    join public.planes_cobro p on p.id = s.plan_id
    where s.activa and p.activo
      and (p_suscripcion is null or s.id = p_suscripcion)
  ),
  periodos as (
    select x.*, g::date as periodo_inicio
    from pasos x,
         lateral generate_series(
           x.base::timestamp,
           least(p_hasta, coalesce(x.fin, p_hasta))::timestamp,
           make_interval(months => x.meses)
         ) g
  )
  insert into public.cobros (student_id, suscripcion_id, concepto, periodo_inicio,
                             periodo_fin, monto, moneda, vence, creado_por)
  select
    pe.student_id,
    pe.id,
    pe.nombre || ' · ' || public.mes_es(pe.periodo_inicio)
      || ' ' || extract(year from pe.periodo_inicio)::int
      || case when pe.meses > 1
              then ' a ' || public.mes_es((pe.periodo_inicio + make_interval(months => pe.meses) - interval '1 day')::date)
                   || ' ' || extract(year from (pe.periodo_inicio + make_interval(months => pe.meses) - interval '1 day'))::int
              else '' end,
    pe.periodo_inicio,
    (pe.periodo_inicio + make_interval(months => pe.meses) - interval '1 day')::date,
    round(pe.monto * (1 - pe.descuento_pct / 100), 2),
    pe.moneda,
    -- El día pedido, o el último del mes si ese mes no lo tiene (31 en abril).
    least(pe.periodo_inicio + (pe.dia_cobro - 1),
          (pe.periodo_inicio + interval '1 month' - interval '1 day')::date),
    auth.uid()
  from periodos pe
  on conflict (suscripcion_id, periodo_inicio) where suscripcion_id is not null
  do nothing;

  get diagnostics v_creados = row_count;
  return v_creados;
end;
$$;
revoke execute on function interno.emitir_cobros(date, uuid) from public, anon, authenticated;

create or replace function public.generar_cobros(p_hasta date default current_date)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not coalesce(public.coordinador_puede('cobros'), false) then
    raise exception 'Solo quien coordina o administra puede generar cobros';
  end if;
  return interno.emitir_cobros(p_hasta, null);
end;
$$;

-- --------------------------------------------------- el recibo y su número
-- De qué academia es el recibo: la que tiene abierta quien supervisa varias
-- (si el alumno es de ella), la única del alumno, o la que supervisa quien
-- registra. Si no se puede saber, de Ajedrez Integral (prefijo AI).
create or replace function interno.academia_para_recibo(p_alumno uuid)
returns uuid language sql stable security definer set search_path = '' set row_security = off as $$
  with suyas as (select m.academia_id from public.academia_miembros m where m.persona_id = p_alumno)
  select case
    when interno.academia_activa() in (select academia_id from suyas) then interno.academia_activa()
    when (select count(*) from suyas) = 1 then (select academia_id from suyas)
    else (select a.id from public.academias a
           where a.id in (select academia_id from suyas) and a.supervisor_id = auth.uid()
           order by a.nombre limit 1)
  end;
$$;

create or replace function interno.emitir_recibo(
  p_alumno uuid, p_fecha date, p_metodo text, p_referencia text, p_nota text, p_emitido_por uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_academia uuid := interno.academia_para_recibo(p_alumno);
  v_prefijo text := public.prefijo_recibo(v_academia);
  v_anio integer := extract(year from p_fecha)::int;
  v_n integer;
  v_id uuid;
begin
  -- Atómico: el upsert bloquea la fila del contador hasta que termina la
  -- transacción, así que dos recibos a la vez no se llevan el mismo número.
  insert into public.recibo_contadores as k (prefijo, anio, ultimo) values (v_prefijo, v_anio, 1)
    on conflict (prefijo, anio) do update set ultimo = k.ultimo + 1
    returning ultimo into v_n;
  insert into public.recibos (numero, academia_id, student_id, fecha, metodo, referencia, nota, emitido_por)
  values ('R-' || v_prefijo || '-' || v_anio || '-' || lpad(v_n::text, 4, '0'),
          v_academia, p_alumno, p_fecha, p_metodo,
          nullif(btrim(coalesce(p_referencia, '')), ''), nullif(btrim(coalesce(p_nota, '')), ''), p_emitido_por)
  returning id into v_id;
  return v_id;
end;
$$;

-- Paga los cobros pedidos ([{cobro_id, monto}]) con UN recibo. Valida todo
-- antes de escribir nada. El permiso lo mira quien la llama.
create or replace function interno.pagar(
  p_pagos jsonb, p_metodo text, p_referencia text, p_nota text, p_fecha date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
  v_fecha date := coalesce(p_fecha, v_hoy);
  v_alumno uuid;
  v_moneda text;
  v_recibo uuid;
  r record;
begin
  if jsonb_typeof(p_pagos) is distinct from 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Falta qué se paga.' using errcode = '22023';
  end if;
  if p_metodo is null or p_metodo not in ('sinpe', 'transferencia', 'efectivo', 'tarjeta', 'otro') then
    raise exception 'Método de pago desconocido.' using errcode = '22023';
  end if;
  if v_fecha > v_hoy then
    raise exception 'La fecha del pago no puede ser en el futuro.' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_pagos))
     <> (select count(distinct e->>'cobro_id') from jsonb_array_elements(p_pagos) e) then
    raise exception 'Un mismo cobro viene dos veces.' using errcode = '22023';
  end if;

  for r in
    select (e->>'monto')::numeric as a_pagar, v.id, v.student_id, v.estado, v.concepto, v.saldo, v.moneda
      from jsonb_array_elements(p_pagos) e
      left join public.cobros_vista v on v.id = (e->>'cobro_id')::uuid
  loop
    if r.id is null then raise exception 'Ese cobro no existe.' using errcode = 'P0002'; end if;
    if not coalesce(public.bajo_mi_coordinacion(r.student_id), false) then
      raise exception 'Ese cobro no es de tu coordinación.' using errcode = '42501';
    end if;
    if r.estado = 'anulado' then
      raise exception 'El cobro «%» está anulado.', r.concepto using errcode = '22023';
    end if;
    if r.a_pagar is null or r.a_pagar <= 0 then
      raise exception 'El monto de cada pago tiene que ser mayor que cero.' using errcode = '22023';
    end if;
    if r.a_pagar > r.saldo then
      raise exception 'El pago de «%» (%) es mayor que lo que falta (%).', r.concepto, r.a_pagar, r.saldo
        using errcode = '22023';
    end if;
    if v_alumno is not null and v_alumno <> r.student_id then
      raise exception 'Un recibo es de un solo alumno.' using errcode = '22023';
    end if;
    if v_moneda is not null and v_moneda <> r.moneda then
      raise exception 'Un recibo va en una sola moneda.' using errcode = '22023';
    end if;
    v_alumno := r.student_id;
    v_moneda := r.moneda;
  end loop;

  v_recibo := interno.emitir_recibo(v_alumno, v_fecha, p_metodo, p_referencia, p_nota, auth.uid());
  insert into public.pagos (cobro_id, monto, metodo, referencia, nota, fecha, registrado_por, recibo_id)
  select (e->>'cobro_id')::uuid, (e->>'monto')::numeric, p_metodo,
         nullif(btrim(coalesce(p_referencia, '')), ''), nullif(btrim(coalesce(p_nota, '')), ''),
         v_fecha, auth.uid(), v_recibo
    from jsonb_array_elements(p_pagos) e;

  return (select jsonb_build_object('id', x.id, 'numero', x.numero) from public.recibos x where x.id = v_recibo);
end;
$$;
revoke execute on function interno.prefijo_de_nombre(text) from public, anon;
grant execute on function interno.prefijo_de_nombre(text) to authenticated;
revoke execute on function interno.academia_para_recibo(uuid) from public, anon, authenticated;
revoke execute on function interno.emitir_recibo(uuid, date, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function interno.pagar(jsonb, text, text, text, date) from public, anon, authenticated;
revoke execute on function interno.cobros_corrige_supervision() from public, anon, authenticated;

