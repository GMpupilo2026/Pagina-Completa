-- Metropolitano 2026: los correos del pago y corregir la inscripción sin
-- escribirle a nadie.
--
-- 1. Cuando administración verifica o rechaza el pago de un envío, sale un
--    correo («Tu pago quedó verificado» o «No pudimos verificar tu
--    comprobante», con el motivo y el enlace para subir otro). Lo manda la
--    Edge Function metropolitano-correo, que toma lo pendiente con
--    metropolitano_avisos_tomar(), nunca dos veces. Un envío se paga una sola
--    vez: verificar o rechazar el pago de alguien de una delegación lo hace
--    para todos los que pagan en ella.
-- 2. Con el enlace secreto de su envío (metropolitano_enlaces), quien inscribió
--    ve su inscripción y corrige lo que no cambia el precio ni el torneo:
--    contactos, emergencia, viaje, fechas del hospedaje y de las comidas,
--    dieta, foto, placa, y sube otro comprobante (el pago vuelve a «por
--    revisar»). Si perdió el enlace, lo pide con su código y su correo
--    (metropolitano_pedir_enlace) y le llega por correo.
-- Ver «Los correos del pago» y «Corregir la inscripción» en
-- docs/decisiones/cuentas-y-formularios.md.

alter table public.metropolitano_inscripciones
  add column pago_aviso_estado text,
  add column pago_aviso_en timestamptz,
  add column pago_aviso_error text,
  add column pago_aviso_intentos int not null default 0,
  add column pago_aviso_tomado timestamptz,
  add column enlace_pedido_en timestamptz,
  add column enlace_enviado_en timestamptz,
  add column enlace_error text,
  add column enlace_tomado timestamptz,
  add column corregido_en timestamptz;

-- Quién mandó el envío: el delegado de la delegación, o la persona sola.
create or replace function interno.metropolitano_principal(p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select d.id from public.metropolitano_inscripciones d where d.grupo = m.grupo and d.es_delegado limit 1), m.id)
    from public.metropolitano_inscripciones m where m.id = p_id;
$$;
revoke execute on function interno.metropolitano_principal(uuid) from public, anon, authenticated;

-- El estado del pago del envío: el de quienes pagan en él (el delegado que no
-- juega no paga y queda «sin costo»).
create or replace function interno.metropolitano_pago_envio(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select r.pago_estado from public.metropolitano_inscripciones r
                    where (r.id = m.id or (m.grupo is not null and r.grupo = m.grupo))
                      and r.estado = 'activa' and r.pago_estado <> 'no_aplica'
                    order by r.numero limit 1), 'no_aplica')
    from public.metropolitano_inscripciones m where m.id = p_id;
$$;
revoke execute on function interno.metropolitano_pago_envio(uuid) from public, anon, authenticated;

-- Revisar un pago: el de una delegación vale para todos los que pagan en ella,
-- con la misma nota (el motivo del rechazo va en el correo).
create or replace function public.metropolitano_revisar(p_id uuid, p_pago_estado text, p_estado text, p_nota text)
returns public.metropolitano_inscripciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.metropolitano_inscripciones;
  v_antes text;
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo quien administra revisa las inscripciones del Metropolitano.' using errcode = '42501';
  end if;
  if p_pago_estado not in ('por_revisar', 'verificado', 'rechazado', 'no_aplica') or p_estado not in ('activa', 'anulada') then
    raise exception 'Estado inválido.';
  end if;
  select * into v from public.metropolitano_inscripciones where id = p_id;
  if not found then
    raise exception 'No existe esa inscripción.';
  end if;
  v_antes := v.pago_estado;
  update public.metropolitano_inscripciones
     set pago_estado = p_pago_estado, estado = p_estado,
         nota_organizacion = nullif(btrim(coalesce(p_nota, '')), ''),
         revisado_por = auth.uid(), revisado_en = now()
   where id = p_id;
  if p_pago_estado is distinct from v_antes then
    if v.grupo is not null and p_pago_estado <> 'no_aplica' then
      update public.metropolitano_inscripciones
         set pago_estado = p_pago_estado, nota_organizacion = nullif(btrim(coalesce(p_nota, '')), ''),
             revisado_por = auth.uid(), revisado_en = now()
       where grupo = v.grupo and id <> p_id and estado = 'activa' and pago_estado <> 'no_aplica';
    end if;
    -- El correo del pago se vuelve a intentar desde cero con el estado nuevo.
    update public.metropolitano_inscripciones set pago_aviso_intentos = 0, pago_aviso_error = null
     where id = interno.metropolitano_principal(p_id);
  end if;
  -- Se vuelve a leer: lo que quedó es lo que se devuelve.
  select * into v from public.metropolitano_inscripciones where id = p_id;
  return v;
end;
$$;

-- Lo que tiene pendiente el correo, además de las confirmaciones: los avisos
-- del pago (verificado o rechazado, una vez por estado) y los enlaces pedidos.
create or replace function interno.metropolitano_avisos_hay()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.metropolitano_inscripciones p
                  where (p.es_delegado or p.grupo is null) and p.estado = 'activa' and p.confirmacion_en is not null
                    and p.pago_aviso_intentos < 3
                    and interno.metropolitano_pago_envio(p.id) in ('verificado', 'rechazado')
                    and p.pago_aviso_estado is distinct from interno.metropolitano_pago_envio(p.id))
      or exists (select 1 from public.metropolitano_inscripciones p
                  where p.enlace_pedido_en is not null and p.enlace_pedido_en > coalesce(p.enlace_enviado_en, '-infinity'::timestamptz));
$$;
revoke execute on function interno.metropolitano_avisos_hay() from public, anon, authenticated;

-- Tomar lo pendiente (solo la Edge Function, con la clave de servicio): en un
-- solo update, para que dos llamadas a la vez no manden lo mismo; lo tomado
-- hace más de 5 minutos (la llamada se cayó) se puede volver a tomar.
create or replace function public.metropolitano_avisos_tomar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pagos jsonb;
  v_enlaces jsonb;
begin
  with pend as (
    select p.id, interno.metropolitano_pago_envio(p.id) est
      from public.metropolitano_inscripciones p
     where (p.es_delegado or p.grupo is null) and p.estado = 'activa' and p.confirmacion_en is not null
       and p.pago_aviso_intentos < 3
       and (p.pago_aviso_tomado is null or p.pago_aviso_tomado < now() - interval '5 minutes')),
  tom as (
    update public.metropolitano_inscripciones m set pago_aviso_tomado = now()
      from pend
     where m.id = pend.id and pend.est in ('verificado', 'rechazado') and m.pago_aviso_estado is distinct from pend.est
    returning m.id, pend.est)
  select coalesce(jsonb_agg(jsonb_build_object('id', tom.id, 'estado', tom.est)), '[]'::jsonb) into v_pagos from tom;
  with tom as (
    update public.metropolitano_inscripciones m set enlace_tomado = now()
     where m.enlace_pedido_en is not null and m.enlace_pedido_en > coalesce(m.enlace_enviado_en, '-infinity'::timestamptz)
       and (m.enlace_tomado is null or m.enlace_tomado < now() - interval '5 minutes')
    returning m.id)
  select coalesce(jsonb_agg(tom.id), '[]'::jsonb) into v_enlaces from tom;
  return jsonb_build_object('pagos', v_pagos, 'enlaces', v_enlaces);
end;
$$;
revoke execute on function public.metropolitano_avisos_tomar() from public, anon, authenticated;
grant execute on function public.metropolitano_avisos_tomar() to service_role;

-- La base llama al correo también cuando hay un aviso del pago o un enlace pedido.
create or replace function interno.metropolitano_correo_tocar()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aviso text;
begin
  if not exists (select 1 from public.metropolitano_inscripciones
                  where confirmacion_en is null and estado = 'activa' and confirmacion_intentos < 3)
     and not interno.metropolitano_avisos_hay() then
    return;
  end if;
  select decrypted_secret into v_aviso from vault.decrypted_secrets where name = 'metropolitano_correo_aviso';
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/metropolitano-correo',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-aviso', v_aviso),
    body := jsonb_build_object('accion', 'enviar'),
    timeout_milliseconds := 120000);
end;
$$;

-- Al cambiar el pago de una inscripción, el correo sale enseguida (una vez por transacción).
create trigger metropolitano_pago_avisa after update of pago_estado on public.metropolitano_inscripciones
  for each statement execute function interno.metropolitano_correo_avisa();

-- Lo que ve quien tiene el enlace: su envío entero, sin documentos ni fotos.
create or replace function public.metropolitano_mi_inscripcion(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p public.metropolitano_inscripciones;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'Este enlace no es válido. Pide uno nuevo con tu código y tu correo.');
  end if;
  select m.* into v_p from public.metropolitano_enlaces e join public.metropolitano_inscripciones m on m.id = e.inscripcion where e.token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Este enlace no es válido. Pide uno nuevo con tu código y tu correo.');
  end if;
  return jsonb_build_object('ok', true, 'delegacion', v_p.delegacion, 'grupo', v_p.grupo is not null,
    'puede_corregir', (now() at time zone 'America/Costa_Rica')::date <= date '2026-12-26',
    'pago', jsonb_build_object('estado', interno.metropolitano_pago_envio(v_p.id), 'metodo', v_p.pago_metodo,
      'total', (select coalesce(sum(r.monto_usd), 0) from public.metropolitano_inscripciones r
                 where (r.id = v_p.id or (v_p.grupo is not null and r.grupo = v_p.grupo)) and r.estado = 'activa'),
      'nota', (select r.nota_organizacion from public.metropolitano_inscripciones r
                where (r.id = v_p.id or (v_p.grupo is not null and r.grupo = v_p.grupo)) and r.pago_estado = 'rechazado'
                order by r.numero limit 1)),
    'personas', (select jsonb_agg(jsonb_build_object('id', r.id, 'codigo', 'MET-' || lpad(r.numero::text, 4, '0'),
        'nombre', r.nombre, 'apellidos', r.apellidos, 'rol', r.rol, 'es_delegado', r.es_delegado, 'sexo', r.sexo,
        'torneos', r.torneos, 'estado', r.estado, 'correo', r.correo, 'telefono', r.telefono, 'emergencia', r.emergencia,
        'origen', r.origen, 'titulado', r.rol = 'jugador' and r.titulo in ('GM', 'IM', 'WGM'), 'viaje', r.viaje,
        'hospedaje', r.hospedaje, 'hospedaje_desde', r.hospedaje_desde, 'hospedaje_hasta', r.hospedaje_hasta, 'acompanantes', r.acompanantes,
        'comidas', r.comidas, 'comidas_desde', r.comidas_desde, 'comidas_hasta', r.comidas_hasta, 'dieta', r.dieta,
        'parqueo', r.parqueo, 'placa', r.placa, 'monto_usd', r.monto_usd, 'pago_estado', r.pago_estado) order by r.numero)
      from public.metropolitano_inscripciones r where r.id = v_p.id or (v_p.grupo is not null and r.grupo = v_p.grupo)));
end;
$$;
revoke execute on function public.metropolitano_mi_inscripcion(text) from public;
grant execute on function public.metropolitano_mi_inscripcion(text) to anon, authenticated;

-- Corregir con el enlace: lo que no cambia el precio ni el torneo. Todo o
-- nada: si algo no cuadra, no cambia ninguna fila.
create or replace function public.metropolitano_corregir(p_token text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.metropolitano_inscripciones;
  v_r public.metropolitano_inscripciones;
  x jsonb;
  quien text;
  v_correo text;
  v_tel text;
  v_viaje jsonb;
  v_desde date;
  v_hasta date;
  v_comidas text[];
  v_cdesde date;
  v_chasta date;
  v_foto text;
  v_placa text;
  v_comp text;
  v_camas int;
  v_noche date;
  v_tit boolean;
  v_mal boolean;
begin
  if (now() at time zone 'America/Costa_Rica')::date > date '2026-12-26' then
    return jsonb_build_object('ok', false, 'error', 'La inscripción ya cerró: para corregir algo, escribe a metropolitano@fcacostarica.com.');
  end if;
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' or jsonb_typeof(p) is distinct from 'object' or length(p::text) > 60000 then
    return jsonb_build_object('ok', false, 'error', 'Este enlace no es válido.');
  end if;
  select m.* into v_p from public.metropolitano_enlaces e join public.metropolitano_inscripciones m on m.id = e.inscripcion where e.token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Este enlace no es válido.');
  end if;
  begin
    for x in select * from jsonb_array_elements(case when jsonb_typeof(p->'personas') = 'array' then p->'personas' else '[]'::jsonb end) loop
      select r.* into v_r from public.metropolitano_inscripciones r
       where r.id = (x->>'id')::uuid and (r.id = v_p.id or (v_p.grupo is not null and r.grupo = v_p.grupo)) and r.estado = 'activa'
       for update;
      if not found then
        raise exception 'Una de las personas no es de esta inscripción.';
      end if;
      quien := v_r.nombre || ' ' || v_r.apellidos || ': ';
      v_tit := v_r.rol = 'jugador' and v_r.titulo in ('GM', 'IM', 'WGM');
      -- El contacto: el de quien mandó la inscripción es obligatorio.
      v_correo := nullif(lower(btrim(coalesce(x->>'correo', ''))), '');
      if (v_correo is null and v_r.id = v_p.id)
         or (v_correo is not null and (v_correo !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' or length(v_correo) > 120 or v_correo like '%@alumno.ajedrez-integral.com')) then
        raise exception '%revisa el correo electrónico.', quien;
      end if;
      v_tel := btrim(coalesce(x->>'telefono', ''));
      if (v_tel = '' and v_r.id = v_p.id)
         or (v_tel <> '' and (length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 7 or length(v_tel) > 25)) then
        raise exception '%revisa el teléfono.', quien;
      end if;
      if btrim(coalesce(x#>>'{emergencia,nombre}', '')) = '' or length(regexp_replace(coalesce(x#>>'{emergencia,telefono}', ''), '[^0-9]', '', 'g')) < 7 then
        raise exception '%falta el contacto para una emergencia (nombre y teléfono).', quien;
      end if;
      -- El viaje: de quien viene de otro país y de los titulados invitados.
      v_viaje := v_r.viaje;
      if (v_r.origen = 'fuera' or v_tit) and jsonb_typeof(x->'viaje') = 'object' then
        v_mal := (coalesce(x#>>'{viaje,llegada}', '') <> '' and x#>>'{viaje,llegada}' !~ '^(2026-12|2027-01)-[0-3][0-9]$')
              or (coalesce(x#>>'{viaje,salida}', '') <> '' and x#>>'{viaje,salida}' !~ '^(2026-12|2027-01)-[0-3][0-9]$');
        if v_mal then
          raise exception '%revisa las fechas del viaje (en diciembre o enero).', quien;
        end if;
        v_viaje := jsonb_build_object('llegada', nullif(x#>>'{viaje,llegada}', ''), 'salida', nullif(x#>>'{viaje,salida}', ''),
          'vuelo', left(btrim(coalesce(x#>>'{viaje,vuelo}', '')), 60),
          'traslado', case when v_r.origen = 'fuera' then coalesce((x#>>'{viaje,traslado}')::boolean, false) else false end);
        if v_tit and (v_viaje->>'llegada' is null or v_viaje->>'salida' is null or (v_viaje->>'salida')::date <= (v_viaje->>'llegada')::date) then
          raise exception '%faltan el día de llegada y el de salida (después del de llegada).', quien;
        end if;
        if v_tit and v_r.origen = 'fuera' and length(v_viaje->>'vuelo') < 3 then
          raise exception '%falta el número de vuelo.', quien;
        end if;
      end if;
      -- Las fechas del hospedaje (si lo pidió).
      v_desde := v_r.hospedaje_desde; v_hasta := v_r.hospedaje_hasta;
      if v_r.hospedaje and coalesce(x->>'hospedaje_desde', '') <> '' then
        v_desde := (x->>'hospedaje_desde')::date; v_hasta := (x->>'hospedaje_hasta')::date;
        if v_desde is null or v_hasta is null or v_desde >= v_hasta or v_desde < date '2026-12-20' or v_hasta > date '2027-01-03' then
          raise exception '%revisa las fechas del hospedaje: entre el 20 de diciembre y el 3 de enero, y la salida después de la llegada.', quien;
        end if;
      end if;
      -- Las comidas (los titulados no las piden: se las da la organización).
      v_comidas := v_r.comidas; v_cdesde := v_r.comidas_desde; v_chasta := v_r.comidas_hasta;
      if not v_tit and jsonb_typeof(x->'comidas') = 'array' then
        select coalesce(array_agg(distinct e), '{}') into v_comidas from jsonb_array_elements_text(x->'comidas') e;
        if not (v_comidas <@ array['desayuno', 'almuerzo', 'cena']) then
          raise exception '%revisa las comidas elegidas.', quien;
        end if;
        if cardinality(v_comidas) > 0 then
          v_cdesde := nullif(x->>'comidas_desde', '')::date; v_chasta := nullif(x->>'comidas_hasta', '')::date;
          if v_cdesde is null or v_chasta is null or v_cdesde > v_chasta or v_cdesde < date '2026-12-20' or v_chasta > date '2027-01-03' then
            raise exception '%revisa los días de la alimentación.', quien;
          end if;
        else
          v_cdesde := null; v_chasta := null;
        end if;
      end if;
      -- Otra foto (va en el gafete).
      v_foto := v_r.foto;
      if coalesce(x->>'foto', '') <> '' and x->>'foto' <> v_r.foto then
        v_foto := x->>'foto';
        if v_foto !~ '^foto/[a-z0-9-]{8,64}/[A-Za-z0-9._-]{1,70}\.(jpg|png|webp)$'
           or not exists (select 1 from storage.objects o where o.bucket_id = 'metropolitano-2026' and o.name = v_foto) then
          raise exception '%no se pudo leer la foto nueva: vuelve a elegirla.', quien;
        end if;
      end if;
      -- La placa del parqueo (si lo pidió): otra placa, el mismo espacio.
      v_placa := v_r.placa;
      if v_r.parqueo and coalesce(x->>'placa', '') <> '' then
        v_placa := upper(regexp_replace(x->>'placa', '[^A-Za-z0-9]', '', 'g'));
        if v_placa !~ '^[A-Z0-9]{2,10}$' then
          raise exception '%revisa la placa del vehículo (de 2 a 10 letras y números).', quien;
        end if;
      end if;
      update public.metropolitano_inscripciones
         set correo = v_correo, telefono = coalesce(nullif(v_tel, ''), telefono),
             emergencia = jsonb_build_object('nombre', left(btrim(x#>>'{emergencia,nombre}'), 100),
               'parentesco', left(btrim(coalesce(x#>>'{emergencia,parentesco}', '')), 40), 'telefono', left(btrim(x#>>'{emergencia,telefono}'), 25)),
             viaje = v_viaje, hospedaje_desde = v_desde, hospedaje_hasta = v_hasta,
             comidas = v_comidas, comidas_desde = v_cdesde, comidas_hasta = v_chasta,
             dieta = case when x ? 'dieta' then nullif(left(btrim(coalesce(x->>'dieta', '')), 300), '') else dieta end,
             foto = v_foto, placa = v_placa, corregido_en = now(),
             -- Una foto nueva vuelve a pasar al Drive.
             drive_en = case when v_foto is distinct from v_r.foto then null else drive_en end
       where id = v_r.id;
    end loop;
    -- Las camas: lo corregido no puede pasarse del tope en ninguna noche.
    select h.camas into v_camas from public.metropolitano_hospedaje h where h.id for update;
    if v_camas is not null then
      select o.noche into v_noche from interno.metropolitano_noches() o
       where o.personas > v_camas
         and exists (select 1 from public.metropolitano_inscripciones r
                      where (r.id = v_p.id or (v_p.grupo is not null and r.grupo = v_p.grupo)) and r.estado = 'activa'
                        and r.hospedaje and r.hospedaje_desde <= o.noche and o.noche < r.hospedaje_hasta)
       order by o.noche limit 1;
      if v_noche is not null then
        raise exception 'El hospedaje ya no tiene camas para la noche del %: elige otras fechas.', interno.metropolitano_dia(v_noche);
      end if;
    end if;
    -- Otro comprobante: el pago del envío vuelve a «por revisar».
    v_comp := nullif(p->>'comprobante', '');
    if v_comp is not null then
      if v_comp !~ '^comprobante/[a-z0-9-]{8,64}/[A-Za-z0-9._-]{1,70}\.(jpg|png|webp|pdf)$'
         or not exists (select 1 from storage.objects o where o.bucket_id = 'metropolitano-2026' and o.name = v_comp) then
        raise exception 'No se pudo leer el comprobante nuevo: vuelve a elegirlo.';
      end if;
      update public.metropolitano_inscripciones
         set comprobante = v_comp, pago_estado = 'por_revisar',
             pago_referencia = coalesce(nullif(left(btrim(coalesce(p->>'pago_referencia', '')), 60), ''), pago_referencia),
             pago_fecha = coalesce(nullif(p->>'pago_fecha', '')::date, pago_fecha),
             corregido_en = now(), drive_en = null
       where (id = v_p.id or (v_p.grupo is not null and grupo = v_p.grupo)) and estado = 'activa' and pago_estado in ('rechazado', 'por_revisar');
      if not found then
        raise exception 'Este pago ya está verificado o no tiene costo: no hace falta otro comprobante.';
      end if;
      update public.metropolitano_inscripciones set pago_aviso_intentos = 0, pago_aviso_error = null where id = v_p.id;
    end if;
  exception
    when raise_exception then
      return jsonb_build_object('ok', false, 'error', sqlerrm);
    when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'Esa placa ya tiene parqueo en otra inscripción.');
    when check_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      return jsonb_build_object('ok', false, 'error', 'Revisa los datos: alguno no tiene el formato esperado.');
  end;
  return public.metropolitano_mi_inscripcion(p_token);
end;
$$;
revoke execute on function public.metropolitano_corregir(text, jsonb) from public;
grant execute on function public.metropolitano_corregir(text, jsonb) to anon, authenticated;

-- Pedir el enlace otra vez: con el código MET-… de cualquiera del envío y el
-- correo de quien lo mandó, el enlace le llega a ese correo. La respuesta es
-- la misma coincida o no: no dice si el código o el correo existen.
create or replace function public.metropolitano_pedir_enlace(p_codigo text, p_correo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_num int;
  v_p public.metropolitano_inscripciones;
  v_freno text;
begin
  if upper(btrim(coalesce(p_codigo, ''))) !~ '^(MET-?)?[0-9]{1,6}$' then
    return jsonb_build_object('ok', false, 'error', 'Escribe el código como viene en el gafete o en el correo: MET-0012.');
  end if;
  if v_correo !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
    return jsonb_build_object('ok', false, 'error', 'Escribe el correo con que se mandó la inscripción.');
  end if;
  v_freno := interno.frenar_envio_publico('solicitud', 'metropolitano-enlace', v_correo);
  if v_freno is not null then
    return jsonb_build_object('ok', false, 'error', v_freno);
  end if;
  v_num := regexp_replace(p_codigo, '[^0-9]', '', 'g')::int;
  select p.* into v_p from public.metropolitano_inscripciones p
   where p.id = interno.metropolitano_principal((select m.id from public.metropolitano_inscripciones m where m.numero = v_num and m.estado = 'activa'));
  if found and lower(coalesce(v_p.correo, '')) = v_correo
     and (v_p.enlace_pedido_en is null or v_p.enlace_pedido_en < now() - interval '2 minutes') then
    update public.metropolitano_inscripciones set enlace_pedido_en = now() where id = v_p.id;
    perform interno.metropolitano_correo_tocar();
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.metropolitano_pedir_enlace(text, text) from public;
grant execute on function public.metropolitano_pedir_enlace(text, text) to anon, authenticated;
