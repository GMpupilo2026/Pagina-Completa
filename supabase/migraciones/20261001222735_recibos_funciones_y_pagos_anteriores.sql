-- Recibos por academia (3 de 3): las funciones que llama la página y los
-- recibos de los pagos que ya había.

-- ------------------------------------------------------- las tres puertas
create or replace function public.registrar_pago(
  p_pagos jsonb, p_metodo text, p_referencia text default null, p_nota text default null, p_fecha date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.coordinador_puede('cobros'), false) then
    raise exception 'Los cobros no están entre tus funciones de coordinación.' using errcode = '42501';
  end if;
  return interno.pagar(p_pagos, p_metodo, p_referencia, p_nota, p_fecha);
end;
$$;

-- Paga por adelantado los p_periodos que siguen sin pagar de una suscripción,
-- del más viejo al más nuevo (lo pendiente primero), emitiendo los que todavía
-- no salieron.
create or replace function public.pago_adelantado(
  p_suscripcion uuid, p_periodos integer, p_metodo text,
  p_referencia text default null, p_nota text default null, p_fecha date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
  s record;
  v_meses integer;
  v_hasta date;
  v_libres integer;
  v_pagos jsonb;
begin
  select su.*, pl.periodicidad, pl.activo as plan_activo into s
    from public.suscripciones su join public.planes_cobro pl on pl.id = su.plan_id
   where su.id = p_suscripcion;
  if not found then raise exception 'Ese plan no existe.' using errcode = 'P0002'; end if;
  if not coalesce(public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(s.student_id), false) then
    raise exception 'Ese alumno no es de tu coordinación.' using errcode = '42501';
  end if;
  if not s.activa or not s.plan_activo then
    raise exception 'Ese plan no está activo: no se le pueden adelantar pagos.' using errcode = '22023';
  end if;
  if p_periodos is null or p_periodos < 1 or p_periodos > 24 then
    raise exception 'Se pueden adelantar de 1 a 24 periodos.' using errcode = '22023';
  end if;
  v_meses := case s.periodicidad when 'mensual' then 1 when 'trimestral' then 3 when 'semestral' then 6 else 12 end;
  v_hasta := greatest(v_hoy, date_trunc('month', s.inicio)::date);

  loop
    perform interno.emitir_cobros(v_hasta, p_suscripcion);
    select count(*) into v_libres from public.cobros_vista
     where suscripcion_id = p_suscripcion and situacion in ('pendiente', 'vencido');
    exit when v_libres >= p_periodos;
    if s.fin is not null and v_hasta >= s.fin then
      raise exception 'Ese plan termina el %: solo quedan % periodos por pagar.', s.fin, v_libres
        using errcode = '22023';
    end if;
    if v_hasta > v_hoy + interval '3 years' then
      raise exception 'Es demasiado adelante: se puede pagar hasta tres años.' using errcode = '22023';
    end if;
    v_hasta := (v_hasta + make_interval(months => v_meses))::date;
  end loop;

  select jsonb_agg(jsonb_build_object('cobro_id', x.id, 'monto', x.saldo) order by x.periodo_inicio)
    into v_pagos
    from (select v.id, v.saldo, v.periodo_inicio from public.cobros_vista v
           where v.suscripcion_id = p_suscripcion and v.situacion in ('pendiente', 'vencido')
           order by v.periodo_inicio limit p_periodos) x;
  return interno.pagar(v_pagos, p_metodo, p_referencia, p_nota, p_fecha);
end;
$$;

-- Un pago que no tenía cobro (una inscripción, un torneo, un adelanto sin
-- plan): se emite el cobro y se paga entero, con su recibo, de una vez.
create or replace function public.registrar_cobro_pagado(
  p_alumno uuid, p_concepto text, p_monto numeric, p_moneda text, p_metodo text,
  p_referencia text default null, p_nota text default null, p_fecha date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date);
  v_cobro uuid;
begin
  if not coalesce(public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(p_alumno), false) then
    raise exception 'Ese alumno no es de tu coordinación.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_concepto, ''))) not between 1 and 200 then
    raise exception 'Escribe qué se paga.' using errcode = '22023';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  insert into public.cobros (student_id, concepto, periodo_inicio, periodo_fin, monto, moneda, vence, creado_por)
  values (p_alumno, btrim(p_concepto), v_fecha, v_fecha, p_monto, coalesce(p_moneda, 'CRC'), v_fecha, auth.uid())
  returning id into v_cobro;
  return interno.pagar(jsonb_build_array(jsonb_build_object('cobro_id', v_cobro, 'monto', p_monto)),
                       p_metodo, p_referencia, p_nota, v_fecha);
end;
$$;

-- --------------------------------------- lo que corrige quien supervisa
-- Cambia los datos del recibo y, si se manda, el monto de cada pago
-- ({pago_id: monto}; 0 quita esa línea). Para dejarlo sin nada, se anula.
create or replace function public.corregir_recibo(
  p_recibo uuid, p_fecha date, p_metodo text, p_referencia text, p_nota text, p_montos jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.recibos;
  k text;
  v_monto numeric;
  r record;
begin
  select * into v from public.recibos where id = p_recibo;
  if not found then raise exception 'Ese recibo no existe.' using errcode = 'P0002'; end if;
  if not interno.corrijo_cobros_de(v.student_id) then
    raise exception 'Corregir un recibo es de quien supervisa la academia o de administración.' using errcode = '42501';
  end if;
  if v.estado = 'anulado' then
    raise exception 'Ese recibo está anulado: reactívalo antes de corregirlo.' using errcode = '22023';
  end if;
  if p_fecha is null or p_fecha > (now() at time zone 'America/Costa_Rica')::date then
    raise exception 'La fecha del pago no puede quedar vacía ni en el futuro.' using errcode = '22023';
  end if;
  if p_metodo is null or p_metodo not in ('sinpe', 'transferencia', 'efectivo', 'tarjeta', 'otro') then
    raise exception 'Método de pago desconocido.' using errcode = '22023';
  end if;

  if p_montos is not null and jsonb_typeof(p_montos) = 'object' then
    for k in select jsonb_object_keys(p_montos) loop
      v_monto := (p_montos->>k)::numeric;
      if v_monto is null or v_monto < 0 then
        raise exception 'Cada monto tiene que ser 0 o más.' using errcode = '22023';
      end if;
      if v_monto = 0 then
        delete from public.pagos where id = k::uuid and recibo_id = p_recibo;
      else
        update public.pagos set monto = v_monto where id = k::uuid and recibo_id = p_recibo;
      end if;
      if not found then raise exception 'Ese pago no es de este recibo.' using errcode = '22023'; end if;
    end loop;
    if not exists (select 1 from public.pagos where recibo_id = p_recibo) then
      raise exception 'Un recibo sin ningún pago no sirve: para eso, anúlalo.' using errcode = '22023';
    end if;
    for r in select v2.concepto, v2.saldo from public.cobros_vista v2
              where v2.id in (select cobro_id from public.pagos where recibo_id = p_recibo) and v2.saldo < 0 loop
      raise exception 'Con ese monto, «%» quedaría pagado de más (%).', r.concepto, -r.saldo using errcode = '22023';
    end loop;
  end if;

  update public.recibos
     set fecha = p_fecha, metodo = p_metodo,
         referencia = nullif(btrim(coalesce(p_referencia, '')), ''),
         nota = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_recibo;
  update public.pagos
     set fecha = p_fecha, metodo = p_metodo,
         referencia = nullif(btrim(coalesce(p_referencia, '')), ''),
         nota = nullif(btrim(coalesce(p_nota, '')), '')
   where recibo_id = p_recibo;
end;
$$;

-- Anular (o volver a abrir) un recibo. Anulado no se borra: es el registro de
-- lo que pasó, y sus pagos dejan de contar.
create or replace function public.anular_recibo(p_recibo uuid, p_anular boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.recibos;
  r record;
begin
  select * into v from public.recibos where id = p_recibo;
  if not found then raise exception 'Ese recibo no existe.' using errcode = 'P0002'; end if;
  if not interno.corrijo_cobros_de(v.student_id) then
    raise exception 'Anular un recibo es de quien supervisa la academia o de administración.' using errcode = '42501';
  end if;
  if p_anular then
    update public.recibos set estado = 'anulado',
           anulado_motivo = nullif(btrim(coalesce(p_motivo, '')), '') where id = p_recibo;
  else
    update public.recibos set estado = 'emitido', anulado_motivo = null where id = p_recibo;
    -- Volver a contar sus pagos no puede dejar un cobro pagado de más.
    for r in select v2.concepto, v2.saldo from public.cobros_vista v2
              where v2.id in (select cobro_id from public.pagos where recibo_id = p_recibo) and v2.saldo < 0 loop
      raise exception 'No se puede reactivar: «%» quedaría pagado de más (%).', r.concepto, -r.saldo
        using errcode = '22023';
    end loop;
  end if;
end;
$$;

-- Lo entregó impreso, en mano (o lo deshace). Igual que mandarlo por correo,
-- es de quien revisa: quien supervisa o administración.
create or replace function public.recibo_entregado_en_mano(p_recibo uuid, p_entregado boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.recibos;
begin
  select * into v from public.recibos where id = p_recibo;
  if not found then raise exception 'Ese recibo no existe.' using errcode = 'P0002'; end if;
  if not interno.corrijo_cobros_de(v.student_id) then
    raise exception 'El recibo lo entrega quien supervisa la academia, después de revisarlo.' using errcode = '42501';
  end if;
  if p_entregado then
    if v.estado = 'anulado' then
      raise exception 'Ese recibo está anulado: no se entrega.' using errcode = '22023';
    end if;
    update public.recibos set entrega = 'mano' where id = p_recibo;
  else
    update public.recibos set entrega = case when enviado_at is not null then 'correo' end where id = p_recibo;
  end if;
end;
$$;
revoke execute on function public.recibo_entregado_en_mano(uuid, boolean) from public, anon;
grant execute on function public.recibo_entregado_en_mano(uuid, boolean) to authenticated;

revoke execute on function public.academia_guardar_prefijo_recibo(uuid, text) from public, anon;
revoke execute on function public.registrar_pago(jsonb, text, text, text, date) from public, anon;
revoke execute on function public.pago_adelantado(uuid, integer, text, text, text, date) from public, anon;
revoke execute on function public.registrar_cobro_pagado(uuid, text, numeric, text, text, text, text, date) from public, anon;
revoke execute on function public.corregir_recibo(uuid, date, text, text, text, jsonb) from public, anon;
revoke execute on function public.anular_recibo(uuid, boolean, text) from public, anon;
revoke execute on function public.prefijo_recibo(uuid) from public, anon;
grant execute on function public.academia_guardar_prefijo_recibo(uuid, text) to authenticated;
grant execute on function public.registrar_pago(jsonb, text, text, text, date) to authenticated;
grant execute on function public.pago_adelantado(uuid, integer, text, text, text, date) to authenticated;
grant execute on function public.registrar_cobro_pagado(uuid, text, numeric, text, text, text, text, date) to authenticated;
grant execute on function public.corregir_recibo(uuid, date, text, text, text, jsonb) to authenticated;
grant execute on function public.anular_recibo(uuid, boolean, text) to authenticated;
grant execute on function public.prefijo_recibo(uuid) to authenticated;
-- La usan las políticas de pagos: authenticated la necesita.
revoke execute on function interno.corrijo_cobros_de(uuid) from public, anon;
grant execute on function interno.corrijo_cobros_de(uuid) to authenticated;

-- ------------------------------------- los pagos que ya había, con recibo
-- Uno por pago, en el orden en que se registraron.
do $$
declare p record; v_id uuid;
begin
  for p in select pg.*, c.student_id from public.pagos pg join public.cobros c on c.id = pg.cobro_id
            where pg.recibo_id is null order by pg.fecha, pg.created_at loop
    v_id := interno.emitir_recibo(p.student_id, p.fecha, p.metodo, p.referencia, p.nota, p.registrado_por);
    update public.pagos set recibo_id = v_id where id = p.id;
  end loop;
end;
$$;
