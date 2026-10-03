-- El pago adelantado, editable: de qué día a qué día, cuánto y cuánto paga hoy.
--
-- «Adelantar N periodos» (pago_adelantado()) no dejaba tocar nada: pagaba los
-- periodos que la corrida emitiera, por su monto, enteros. Y como contaba un
-- pedazo de mes como un periodo, a quien ya tenía pagado hasta el 15 de
-- diciembre «adelantar 1» le emitía y le cobraba del 16 al 31 de diciembre
-- (₡5 202,58), no un mes. Ahora la página propone el periodo que sigue
-- (cobro_siguiente(): desde el primer día que nada cubre, N periodos del plan
-- de largo), lo cotiza con cobro_cotizar() y todo se puede cambiar antes de
-- registrarlo: las dos fechas, el concepto, el monto y lo que paga hoy.
--
-- Pago parcial: el cobro se emite por el monto entero y se paga solo lo que
-- trajo. Lo que falta queda pendiente en ese cobro, como cualquier otro saldo:
-- sale en «Cobros», con sus avisos, y se termina de pagar desde ahí.

-- ------------------------------------------------- el periodo que sigue
-- El primer día que no cubre nada (ni el inicio del plan, ni lo ya pagado de
-- antes, ni un cobro vigente del plan) y N periodos del plan desde ahí: desde
-- el 16 de diciembre, un mes llega al 15 de enero. Respeta el fin del plan.
-- También dice qué cobros del plan siguen pendientes: esos se pagan en
-- «Cobros», no se vuelven a emitir.
create or replace function public.cobro_siguiente(p_suscripcion uuid, p_periodos integer default 1)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s record;
  v_meses integer;
  v_desde date;
  v_hasta date;
  v_pendientes text;
begin
  select su.student_id, su.inicio, su.fin, su.pagado_hasta, su.activa, pl.periodicidad, pl.activo as plan_activo
    into s
    from public.suscripciones su join public.planes_cobro pl on pl.id = su.plan_id
   where su.id = p_suscripcion;
  if not found then raise exception 'Ese plan no existe.' using errcode = 'P0002'; end if;
  if not coalesce(public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(s.student_id), false) then
    raise exception 'Ese alumno no es de tu coordinación.' using errcode = '42501';
  end if;
  if p_periodos is null or p_periodos < 1 or p_periodos > 24 then
    raise exception 'Se pueden adelantar de 1 a 24 periodos.' using errcode = '22023';
  end if;
  v_meses := case s.periodicidad when 'mensual' then 1 when 'trimestral' then 3 when 'semestral' then 6 else 12 end;

  v_desde := greatest(
    s.inicio,
    s.pagado_hasta + 1,
    (select max(c.periodo_fin) + 1 from public.cobros c
      where c.suscripcion_id = p_suscripcion and c.estado = 'emitido'));
  v_hasta := (v_desde + make_interval(months => v_meses * p_periodos) - interval '1 day')::date;
  if s.fin is not null and v_hasta > s.fin then v_hasta := s.fin; end if;

  select string_agg(v.concepto || ' (falta ' || v.saldo || ')', ', ' order by v.periodo_inicio)
    into v_pendientes
    from public.cobros_vista v
   where v.suscripcion_id = p_suscripcion and v.situacion in ('pendiente', 'vencido');

  return jsonb_build_object(
    'desde', v_desde,
    'hasta', case when v_hasta >= v_desde then v_hasta end,
    'activo', s.activa and s.plan_activo,
    'pendientes', v_pendientes);
end;
$$;

revoke execute on function public.cobro_siguiente(uuid, integer) from public, anon;
grant execute on function public.cobro_siguiente(uuid, integer) to authenticated;

-- ---------------------------------------- emitir el cobro y pagar lo que trajo
-- El cuerpo de registrar_cobro_pagado_con_periodo(), con `p_pagado`: lo que
-- paga hoy (en blanco, todo). Otro nombre y no otra firma de la misma, por lo
-- de PostgREST con dos firmas (ver paquete_guardar); la de siempre queda como
-- una línea que la llama, así la regla vive en un solo lugar.
create or replace function public.registrar_cobro_y_abono(
  p_alumno uuid, p_concepto text, p_monto numeric, p_moneda text, p_metodo text,
  p_referencia text default null, p_nota text default null, p_fecha date default null,
  p_suscripcion uuid default null, p_desde date default null, p_hasta date default null,
  p_pagado numeric default null)
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
  v_pagado numeric;
  v_moneda text := coalesce(p_moneda, 'CRC');
begin
  if not coalesce(public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(p_alumno), false) then
    raise exception 'Ese alumno no es de tu coordinación.' using errcode = '42501';
  end if;
  if (p_desde is null) <> (p_hasta is null) then
    raise exception 'Falta una de las dos fechas del periodo.' using errcode = '22023';
  end if;

  if p_suscripcion is not null then
    -- Un periodo de un plan: cubre esos días de ESE plan, así que la corrida
    -- diaria ya no los vuelve a cobrar.
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
  v_pagado := coalesce(p_pagado, v_monto);
  if v_pagado <= 0 then
    raise exception 'Lo que paga hoy tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if v_pagado > v_monto then
    raise exception 'Lo que paga hoy (%) es más que el monto del cobro (%).', v_pagado, v_monto using errcode = '22023';
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

  return interno.pagar(jsonb_build_array(jsonb_build_object('cobro_id', v_cobro, 'monto', v_pagado)),
                       p_metodo, p_referencia, p_nota, v_fecha);
end;
$$;

revoke execute on function public.registrar_cobro_y_abono(uuid, text, numeric, text, text, text, text, date, uuid, date, date, numeric) from public, anon;
grant execute on function public.registrar_cobro_y_abono(uuid, text, numeric, text, text, text, text, date, uuid, date, date, numeric) to authenticated;

create or replace function public.registrar_cobro_pagado_con_periodo(
  p_alumno uuid, p_concepto text, p_monto numeric, p_moneda text, p_metodo text,
  p_referencia text default null, p_nota text default null, p_fecha date default null,
  p_suscripcion uuid default null, p_desde date default null, p_hasta date default null)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.registrar_cobro_y_abono(p_alumno, p_concepto, p_monto, p_moneda, p_metodo, p_referencia,
                                        p_nota, p_fecha, p_suscripcion, p_desde, p_hasta, null);
$$;
