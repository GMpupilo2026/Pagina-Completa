-- Cobros, versión 2: una fecha de «activo hasta» por cuenta.
--
-- Hasta acá había dos sistemas que no se hablaban: cobros.html (planes,
-- suscripciones, cobros emitidos y pagos) y accesos.html (paquetes que dicen
-- quién entra). Pagar no alargaba el acceso y no pagar no lo cortaba: había
-- que hacer las dos cosas a mano, en dos pantallas.
--
-- Ahora la pregunta es una sola: ¿hasta qué día está pagada esta cuenta?
--
--  · Una CUENTA DE COBRO es una familia o un alumno: un monto mensual y uno o
--    más alumnos (como un paquete de 1 cupo es una cuenta individual, una
--    cuenta de 1 alumno es la de siempre: no hay dos mecanismos).
--  · «Activo hasta» NO se guarda: se calcula. Es lo mayor entre la fecha que
--    se puso a mano (`activo_hasta_base`) y el último día cubierto por un cobro
--    PAGADO de la cuenta. Anular un recibo deja su cobro sin pagar y la fecha
--    vuelve atrás sola, sin tocar nada más (la regla de «Cobros: lo que se
--    guarda es lo que pasó, no el estado»).
--  · Registrar un pago es UN paso: cuenta_cobro_pagar() emite el cobro del
--    periodo (desde/hasta), lo paga y saca el recibo, en la misma transacción,
--    con las mismas piezas de siempre (cobros, pagos, recibos, interno.pagar).
--  · El estado (al día / vence pronto / vencido / apagado) lo da UNA función,
--    interno.cuenta_cobro_estado(), que usan la lista, mi_acceso() y el
--    candado (acceso_vigente()): no pueden contradecirse.
--  · Apagar: a mano (`apagada`) o solo, si quien administra enciende
--    `apagado_auto` y la cuenta pasa los días de gracia sin pagar. Las dos
--    cosas las lee acceso_vigente(): el candado de verdad sigue en la base.
--  · El alumno apagado puede reportar su pago con la foto del comprobante
--    (pagos_reportados + el bucket comprobantes-pago). Quien coordina lo
--    confirma con un toque: eso es cuenta_cobro_pagar() con el reporte, que
--    activa la cuenta y saca el recibo.
--
-- Los dos automáticos (avisos y apagado) arrancan APAGADOS: el dueño quiere
-- hacerlo todo a mano primero y encenderlos cuando confíe. Con los dos
-- apagados, ninguna cuenta se corta sola y no sale ningún correo.

-- ------------------------------------------------------------------ 1. ajustes
create table public.cobros_ajustes (
  id boolean primary key default true check (id),
  avisos_auto boolean not null default false,
  apagado_auto boolean not null default false,
  dias_gracia smallint not null default 5 check (dias_gracia between 1 and 60),
  dias_aviso_antes smallint not null default 3 check (dias_aviso_antes between 0 and 15),
  sinpe_numero text check (sinpe_numero is null or sinpe_numero ~ '^[0-9]{8}$'),
  sinpe_nombre text check (sinpe_nombre is null or length(sinpe_nombre) between 1 and 120),
  cambiado_por uuid references public.profiles(id) on delete set null,
  cambiado_at timestamptz
);
insert into public.cobros_ajustes (id) values (true);
alter table public.cobros_ajustes enable row level security;
revoke insert, update, delete on public.cobros_ajustes from anon, authenticated;
create policy cobros_ajustes_lee on public.cobros_ajustes for select to authenticated
  using ((select public.soy_coordinador()));

-- ------------------------------------------------------------------ 2. cuentas
create table public.cuentas_cobro (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  monto numeric(12,2) not null check (monto > 0 and monto <= 10000000),
  moneda text not null default 'CRC' check (moneda in ('CRC', 'USD')),
  activo_hasta_base date not null,
  apagada boolean not null default false,
  nota text check (nota is null or length(nota) <= 1000),
  creado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.cuenta_cobro_alumnos (
  cuenta_id uuid not null references public.cuentas_cobro(id) on delete cascade,
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  agregado_at timestamptz not null default now(),
  primary key (cuenta_id, alumno_id)
);
-- Un alumno está en UNA cuenta: si estuviera en dos, ¿cuál decide si entra?
create unique index cuenta_cobro_alumnos_un_alumno on public.cuenta_cobro_alumnos (alumno_id);

alter table public.cobros add column cuenta_id uuid references public.cuentas_cobro(id) on delete set null;
create index cobros_cuenta_id on public.cobros (cuenta_id) where cuenta_id is not null;

alter table public.cuentas_cobro enable row level security;
alter table public.cuenta_cobro_alumnos enable row level security;
revoke insert, update, delete on public.cuentas_cobro, public.cuenta_cobro_alumnos from anon, authenticated;

-- ¿Ve quien llama esta cuenta? Administración todas; quien coordina (con la
-- función «cobros») las que tienen algún alumno bajo su coordinación, y la que
-- acaba de crear y todavía no tiene alumnos.
create or replace function interno.veo_cuenta_cobro(p_cuenta uuid)
returns boolean
language sql stable security definer
set search_path = '' set row_security = off
as $$
  select coalesce(public.soy_admin()
    or (public.coordinador_puede('cobros') and (
          exists (select 1 from public.cuenta_cobro_alumnos ca
                   where ca.cuenta_id = p_cuenta and public.bajo_mi_coordinacion(ca.alumno_id))
          or exists (select 1 from public.cuentas_cobro c
                      where c.id = p_cuenta and c.creado_por = auth.uid()
                        and not exists (select 1 from public.cuenta_cobro_alumnos ca where ca.cuenta_id = p_cuenta)))),
    false);
$$;
revoke execute on function interno.veo_cuenta_cobro(uuid) from public, anon;
grant execute on function interno.veo_cuenta_cobro(uuid) to authenticated;

-- Las cuentas son pocas (una por familia), así que preguntar por fila no pesa;
-- las tablas que crecen (cobros, pagos) siguen con su RLS de siempre.
create policy cuentas_cobro_lee on public.cuentas_cobro for select to authenticated
  using ((select public.soy_admin()) or interno.veo_cuenta_cobro(id));
create policy cuenta_cobro_alumnos_lee on public.cuenta_cobro_alumnos for select to authenticated
  using ((select public.soy_admin()) or interno.veo_cuenta_cobro(cuenta_id));

-- ------------------------------------------------------------ 3. el estado
-- La ÚNICA regla. «Hasta» está incluido: activo hasta el 5 es que el 5 entra.
-- Se apaga solo el día hasta + días de gracia (venció el 5, gracia 5: el 10).
create or replace function interno.cuenta_cobro_estado(p_cuenta uuid)
returns jsonb
language plpgsql stable security definer
set search_path = '' set row_security = off
as $$
declare
  v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
  c public.cuentas_cobro;
  a public.cobros_ajustes;
  v_pagado date;
  v_ultimo date;
  v_hasta date;
  v_apaga date;
  v_auto boolean;
  v_estado text;
begin
  select * into c from public.cuentas_cobro where id = p_cuenta;
  if not found then return null; end if;
  select * into a from public.cobros_ajustes where id;
  v_auto := coalesce(a.apagado_auto, false);

  -- El último día cubierto por un cobro PAGADO entero (un recibo anulado no
  -- cuenta: es la misma suma que cobros_vista).
  select max(x.periodo_fin), max(x.ultimo) into v_pagado, v_ultimo
    from (select k.periodo_fin, k.monto, s.pagado, s.ultimo
            from public.cobros k
            cross join lateral (
              select coalesce(sum(p.monto), 0) as pagado, max(p.fecha) as ultimo
                from public.pagos p
               where p.cobro_id = k.id
                 and not exists (select 1 from public.recibos r where r.id = p.recibo_id and r.estado = 'anulado')) s
           where k.cuenta_id = p_cuenta and k.estado = 'emitido') x
   where x.pagado >= x.monto;

  v_hasta := greatest(c.activo_hasta_base, v_pagado);
  v_apaga := v_hasta + coalesce(a.dias_gracia, 5);
  v_estado := case
    when c.apagada then 'apagado'
    when v_hoy <= v_hasta - coalesce(a.dias_aviso_antes, 3) then 'al_dia'
    when v_hoy <= v_hasta then 'vence_pronto'
    when v_auto and v_hoy >= v_apaga then 'apagado'
    else 'vencido'
  end;

  return jsonb_build_object(
    'activo_hasta', v_hasta,
    'pagado_hasta', v_pagado,
    'ultimo_pago', v_ultimo,
    'estado', v_estado,
    'dias', v_hasta - v_hoy,
    'apaga_el', case when v_auto and not c.apagada then v_apaga end,
    'apagada_a_mano', c.apagada);
end;
$$;
revoke execute on function interno.cuenta_cobro_estado(uuid) from public, anon;
grant execute on function interno.cuenta_cobro_estado(uuid) to authenticated;


-- ------------------------------------------------- 4. los pagos que reporta el alumno
-- El alumno (sobre todo el apagado) avisa que pagó y sube la foto del SINPE.
-- No escribe la tabla: lo hace pago_reportar(), que valida. Uno pendiente por
-- cuenta a la vez (lo garantiza el índice): mandar el mismo comprobante tres
-- veces no lo confirma más rápido.
create table public.pagos_reportados (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas_cobro(id) on delete cascade,
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  monto numeric(12,2) not null check (monto > 0 and monto <= 10000000),
  fecha date not null,
  referencia text check (referencia is null or length(referencia) <= 120),
  comprobante text check (comprobante is null or length(comprobante) <= 300),
  nota text check (nota is null or length(nota) <= 500),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmado', 'rechazado')),
  motivo text check (motivo is null or length(motivo) <= 500),
  revisado_por uuid references public.profiles(id) on delete set null,
  revisado_at timestamptz,
  recibo_id uuid references public.recibos(id) on delete set null,
  created_at timestamptz not null default now(),
  check (comprobante is not null or referencia is not null)
);
create unique index pagos_reportados_uno_pendiente on public.pagos_reportados (cuenta_id) where estado = 'pendiente';
create index pagos_reportados_alumno on public.pagos_reportados (alumno_id);
alter table public.pagos_reportados enable row level security;
revoke insert, update, delete on public.pagos_reportados from anon, authenticated;
create policy pagos_reportados_lee on public.pagos_reportados for select to authenticated
  using (alumno_id = (select auth.uid()) or (select public.soy_admin()) or interno.veo_cuenta_cobro(cuenta_id));

-- Las fotos: privadas, en la carpeta de quien las sube. Las ve quien las subió
-- y quien ve la cuenta del reporte que las nombra.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes-pago', 'comprobantes-pago', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

create policy comprobantes_pago_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes-pago'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy comprobantes_pago_select on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes-pago'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or exists (select 1 from public.pagos_reportados r
                          where r.comprobante = objects.name and interno.veo_cuenta_cobro(r.cuenta_id))));

-- ------------------------------------------------------------ 5. la vista
-- La lista de la pantalla. security_invoker: quién ve qué fila lo decide la
-- RLS de cuentas_cobro, no la vista.
create view public.cuentas_cobro_vista with (security_invoker = on) as
select c.id, c.nombre, c.monto, c.moneda, c.apagada, c.nota, c.activo_hasta_base, c.created_at,
       (e->>'activo_hasta')::date as activo_hasta,
       (e->>'pagado_hasta')::date as pagado_hasta,
       (e->>'ultimo_pago')::date as ultimo_pago,
       e->>'estado' as estado,
       (e->>'dias')::int as dias,
       (e->>'apaga_el')::date as apaga_el,
       coalesce((select array_agg(ca.alumno_id order by ca.agregado_at, ca.alumno_id)
                   from public.cuenta_cobro_alumnos ca where ca.cuenta_id = c.id), '{}') as alumnos,
       (select count(*)::int from public.pagos_reportados r
         where r.cuenta_id = c.id and r.estado = 'pendiente') as reportes_pendientes
  from public.cuentas_cobro c
  cross join lateral interno.cuenta_cobro_estado(c.id) e;

-- ------------------------------------------------------------ 6. las funciones
-- «6 nov al 5 dic 2026»: el concepto del cobro y del recibo.
create or replace function interno.periodo_texto(p_desde date, p_hasta date)
returns text
language sql immutable
set search_path = ''
as $$
  select extract(day from p_desde)::int || ' '
      || (array['ene','feb','mar','abr','may','jun','jul','ago','set','oct','nov','dic'])[extract(month from p_desde)::int]
      || case when extract(year from p_desde) <> extract(year from p_hasta) then ' ' || extract(year from p_desde)::int else '' end
      || ' al ' || extract(day from p_hasta)::int || ' '
      || (array['ene','feb','mar','abr','may','jun','jul','ago','set','oct','nov','dic'])[extract(month from p_hasta)::int]
      || ' ' || extract(year from p_hasta)::int;
$$;
revoke execute on function interno.periodo_texto(date, date) from public, anon;

-- Crear o editar una cuenta. La lista de alumnos queda EXACTAMENTE como llega
-- (la regla de las set_*), salvo los que ya estaban y no son de quien llama:
-- esos se conservan, porque su pantalla no los ve.
-- p_activo_hasta es la fecha a mano: para arrancar con lo que cada familia ya
-- tiene pagado, o regalar unos días. Nunca puede quedar antes de lo PAGADO:
-- para acortar eso se anula el recibo.
create or replace function public.cuenta_cobro_guardar(
  p_id uuid, p_nombre text, p_monto numeric, p_moneda text,
  p_activo_hasta date, p_nota text, p_alumnos uuid[])
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_pagado date;
  v_otro text;
  v_alumnos uuid[] := coalesce(p_alumnos, '{}');
  a uuid;
begin
  if not coalesce(public.coordinador_puede('cobros'), false) then
    raise exception 'Los cobros los lleva quien coordina o administra.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) not between 1 and 120 then
    raise exception 'Escribe el nombre de la cuenta (el alumno o la familia).' using errcode = '22023';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto > 10000000 then
    raise exception 'La mensualidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if coalesce(p_moneda, 'CRC') not in ('CRC', 'USD') then
    raise exception 'Moneda desconocida.' using errcode = '22023';
  end if;
  if p_activo_hasta is null then
    raise exception 'Di hasta qué día está activa.' using errcode = '22023';
  end if;
  if p_activo_hasta > (now() at time zone 'America/Costa_Rica')::date + 800 then
    raise exception 'Esa fecha queda a más de dos años.' using errcode = '22023';
  end if;

  foreach a in array v_alumnos loop
    if not coalesce(public.bajo_mi_coordinacion(a), false)
       or not exists (select 1 from public.profiles p where p.id = a and p.role = 'alumno') then
      raise exception 'Uno de los alumnos no es de tu coordinación.' using errcode = '42501';
    end if;
    select c.nombre into v_otro
      from public.cuenta_cobro_alumnos ca join public.cuentas_cobro c on c.id = ca.cuenta_id
     where ca.alumno_id = a and ca.cuenta_id is distinct from v_id;
    if v_otro is not null then
      raise exception '% ya está en la cuenta «%». Sácalo de ahí primero.',
        coalesce((select p.full_name from public.profiles p where p.id = a), 'Un alumno'), v_otro using errcode = '22023';
    end if;
  end loop;

  if v_id is null then
    insert into public.cuentas_cobro (nombre, monto, moneda, activo_hasta_base, nota, creado_por)
    values (btrim(p_nombre), p_monto, coalesce(p_moneda, 'CRC'), p_activo_hasta,
            nullif(btrim(coalesce(p_nota, '')), ''), auth.uid())
    returning id into v_id;
  else
    if not interno.veo_cuenta_cobro(v_id) then
      raise exception 'Esa cuenta no es de tu coordinación.' using errcode = '42501';
    end if;
    v_pagado := (interno.cuenta_cobro_estado(v_id)->>'pagado_hasta')::date;
    if v_pagado is not null and p_activo_hasta < v_pagado then
      raise exception 'Ya está pagada hasta el %. Para acortarla, anula el recibo de ese pago.',
        to_char(v_pagado, 'DD/MM/YYYY') using errcode = '22023';
    end if;
    update public.cuentas_cobro
       set nombre = btrim(p_nombre), monto = p_monto, moneda = coalesce(p_moneda, 'CRC'),
           activo_hasta_base = p_activo_hasta, nota = nullif(btrim(coalesce(p_nota, '')), '')
     where id = v_id;
    delete from public.cuenta_cobro_alumnos ca
     where ca.cuenta_id = v_id and not (ca.alumno_id = any (v_alumnos))
       and public.bajo_mi_coordinacion(ca.alumno_id);
  end if;

  insert into public.cuenta_cobro_alumnos (cuenta_id, alumno_id)
  select v_id, x from unnest(v_alumnos) x
  on conflict do nothing;

  if not exists (select 1 from public.cuenta_cobro_alumnos where cuenta_id = v_id) then
    raise exception 'Una cuenta lleva al menos un alumno.' using errcode = '22023';
  end if;
  return v_id;
end;
$$;

-- Apagar o encender a mano. Encender no paga nada: si sigue vencida y el
-- apagado automático está encendido, se vuelve a apagar sola.
create or replace function public.cuenta_cobro_apagar(p_id uuid, p_apagar boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not coalesce(public.coordinador_puede('cobros') and interno.veo_cuenta_cobro(p_id), false) then
    raise exception 'Esa cuenta no es de tu coordinación.' using errcode = '42501';
  end if;
  update public.cuentas_cobro set apagada = coalesce(p_apagar, false) where id = p_id;
end;
$$;

-- Borrar una cuenta: sus alumnos dejan de pasar por cobros (vuelve a decidir
-- su paquete). Los cobros y recibos que ya salieron se quedan: son lo que pasó.
create or replace function public.cuenta_cobro_borrar(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not coalesce(public.coordinador_puede('cobros') and interno.veo_cuenta_cobro(p_id), false) then
    raise exception 'Esa cuenta no es de tu coordinación.' using errcode = '42501';
  end if;
  delete from public.cuentas_cobro where id = p_id;
end;
$$;

-- Registrar un pago: emite el cobro de esos días, lo paga y saca el recibo.
-- Con p_reporte, además confirma el pago que reportó el alumno.
-- El recibo va a nombre del primer alumno de la cuenta (un recibo es de un
-- alumno: lo exige interno.pagar), con el nombre de la cuenta en el concepto.
create or replace function public.cuenta_cobro_pagar(
  p_cuenta uuid, p_desde date, p_hasta date, p_monto numeric, p_metodo text,
  p_referencia text default null, p_nota text default null, p_fecha date default null,
  p_reporte uuid default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.cuentas_cobro;
  v_titular uuid;
  v_cobro uuid;
  v_choca text;
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date);
  v_recibo jsonb;
  v_concepto text;
begin
  if not coalesce(public.coordinador_puede('cobros') and interno.veo_cuenta_cobro(p_cuenta), false) then
    raise exception 'Esa cuenta no es de tu coordinación.' using errcode = '42501';
  end if;
  select * into c from public.cuentas_cobro where id = p_cuenta for update;
  select ca.alumno_id into v_titular from public.cuenta_cobro_alumnos ca
   where ca.cuenta_id = p_cuenta order by ca.agregado_at, ca.alumno_id limit 1;
  if v_titular is null then
    raise exception 'La cuenta no tiene alumnos.' using errcode = '22023';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Di de qué día a qué día cubre el pago.' using errcode = '22023';
  end if;
  if p_hasta - p_desde > 400 then
    raise exception 'Un pago cubre como mucho un año.' using errcode = '22023';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto > 10000000 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  -- Esos días no pueden estar ya pagados en esta cuenta.
  select k.concepto into v_choca
    from public.cobros_vista k join public.cobros kk on kk.id = k.id
   where kk.cuenta_id = p_cuenta and k.situacion = 'pagado'
     and daterange(k.periodo_inicio, k.periodo_fin, '[]') && daterange(p_desde, p_hasta, '[]')
   limit 1;
  if v_choca is not null then
    raise exception 'Esos días ya están pagados («%»).', v_choca using errcode = '22023';
  end if;

  if p_reporte is not null then
    perform 1 from public.pagos_reportados r
     where r.id = p_reporte and r.cuenta_id = p_cuenta and r.estado = 'pendiente' for update;
    if not found then
      raise exception 'Ese comprobante ya se revisó o no es de esta cuenta.' using errcode = '22023';
    end if;
  end if;

  v_concepto := 'Mensualidad · ' || interno.periodo_texto(p_desde, p_hasta)
             || case when (select count(*) from public.cuenta_cobro_alumnos where cuenta_id = p_cuenta) > 1
                     then ' · ' || c.nombre else '' end;
  insert into public.cobros (student_id, suscripcion_id, cuenta_id, concepto, periodo_inicio, periodo_fin,
                             monto, moneda, vence, creado_por)
  values (v_titular, null, p_cuenta, left(v_concepto, 200), p_desde, p_hasta, p_monto, c.moneda, p_desde, auth.uid())
  returning id into v_cobro;

  v_recibo := interno.pagar(jsonb_build_array(jsonb_build_object('cobro_id', v_cobro, 'monto', p_monto)),
                            p_metodo, p_referencia, p_nota, v_fecha);

  if p_reporte is not null then
    update public.pagos_reportados
       set estado = 'confirmado', revisado_por = auth.uid(), revisado_at = now(),
           recibo_id = (v_recibo->>'id')::uuid
     where id = p_reporte;
  end if;

  return v_recibo || jsonb_build_object('activo_hasta', interno.cuenta_cobro_estado(p_cuenta)->>'activo_hasta');
end;
$$;

create or replace function public.pago_reporte_rechazar(p_id uuid, p_motivo text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_cuenta uuid;
begin
  select cuenta_id into v_cuenta from public.pagos_reportados where id = p_id and estado = 'pendiente';
  if v_cuenta is null then
    raise exception 'Ese comprobante ya se revisó.' using errcode = '22023';
  end if;
  if not coalesce(public.coordinador_puede('cobros') and interno.veo_cuenta_cobro(v_cuenta), false) then
    raise exception 'Esa cuenta no es de tu coordinación.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) not between 1 and 500 then
    raise exception 'Di por qué no se confirma: el alumno lo va a leer.' using errcode = '22023';
  end if;
  update public.pagos_reportados
     set estado = 'rechazado', motivo = btrim(p_motivo), revisado_por = auth.uid(), revisado_at = now()
   where id = p_id;
end;
$$;

-- El alumno reporta su pago. Solo sobre SU cuenta: no recibe ninguna.
create or replace function public.pago_reportar(
  p_monto numeric, p_fecha date, p_referencia text, p_comprobante text, p_nota text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
  v_cuenta uuid;
  v_id uuid;
  v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_foto text := nullif(btrim(coalesce(p_comprobante, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión.' using errcode = '42501';
  end if;
  select ca.cuenta_id into v_cuenta from public.cuenta_cobro_alumnos ca where ca.alumno_id = auth.uid();
  if v_cuenta is null then
    raise exception 'Tu cuenta no tiene una mensualidad registrada. Escríbenos por WhatsApp.' using errcode = '22023';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto > 10000000 then
    raise exception 'Escribe cuánto pagaste.' using errcode = '22023';
  end if;
  if p_fecha is null or p_fecha > v_hoy or p_fecha < v_hoy - 120 then
    raise exception 'La fecha del pago no puede ser en el futuro ni de hace más de cuatro meses.' using errcode = '22023';
  end if;
  if v_foto is null and v_ref is null then
    raise exception 'Sube la foto del comprobante o escribe el número de la transferencia.' using errcode = '22023';
  end if;
  if v_foto is not null and v_foto !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]{1,120}$') then
    raise exception 'El comprobante no se subió bien. Vuelve a intentarlo.' using errcode = '22023';
  end if;
  begin
    insert into public.pagos_reportados (cuenta_id, alumno_id, monto, fecha, referencia, comprobante, nota)
    values (v_cuenta, auth.uid(), p_monto, p_fecha, left(v_ref, 120), v_foto,
            left(nullif(btrim(coalesce(p_nota, '')), ''), 500))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya mandaste un comprobante y está por revisarse. Te avisamos en cuanto se confirme.' using errcode = '22023';
  end;
  return v_id;
end;
$$;

-- Lo que el alumno ve de su propia cuenta: su último reporte (para saber si
-- está por revisarse o por qué no se confirmó).
create or replace function public.mi_reporte_de_pago()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select to_jsonb(x) from (
    select r.id, r.estado, r.motivo, r.monto, r.fecha, r.created_at
      from public.pagos_reportados r
     where r.alumno_id = auth.uid()
     order by r.created_at desc limit 1) x;
$$;

-- Los ajustes: solo administración (son para toda la Academia).
create or replace function public.cobros_ajustes_guardar(
  p_avisos_auto boolean, p_apagado_auto boolean, p_dias_gracia int, p_dias_aviso_antes int,
  p_sinpe_numero text, p_sinpe_nombre text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_num text := nullif(regexp_replace(coalesce(p_sinpe_numero, ''), '\D', '', 'g'), '');
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Los ajustes de cobros los cambia quien administra.' using errcode = '42501';
  end if;
  if v_num is not null and v_num !~ '^[0-9]{8}$' then
    raise exception 'El número de SINPE Móvil lleva 8 dígitos.' using errcode = '22023';
  end if;
  update public.cobros_ajustes
     set avisos_auto = coalesce(p_avisos_auto, false),
         apagado_auto = coalesce(p_apagado_auto, false),
         dias_gracia = coalesce(p_dias_gracia, 5),
         dias_aviso_antes = coalesce(p_dias_aviso_antes, 3),
         sinpe_numero = v_num,
         sinpe_nombre = nullif(btrim(coalesce(p_sinpe_nombre, '')), ''),
         cambiado_por = auth.uid(), cambiado_at = now()
   where id;
end;
$$;

-- Las cuentas de arriba de la pantalla, una fila por moneda. SECURITY INVOKER:
-- suma lo que quien llama ve, nada más.
create or replace function public.cuentas_cobro_resumen()
returns table (moneda text, entro_mes numeric, cuentas int, vencidas int, apagadas int, monto_vencidas numeric)
language sql stable security invoker
set search_path = ''
as $$
  with mes as (select date_trunc('month', (now() at time zone 'America/Costa_Rica'))::date as ini),
  entro as (
    select k.moneda, sum(p.monto) as total
      from public.pagos p
      join public.cobros k on k.id = p.cobro_id
      join public.recibos r on r.id = p.recibo_id
     where k.cuenta_id is not null and r.estado <> 'anulado'
       and p.fecha >= (select ini from mes)
     group by k.moneda),
  ctas as (
    select v.moneda, count(*)::int as cuentas,
           count(*) filter (where v.estado = 'vencido')::int as vencidas,
           count(*) filter (where v.estado = 'apagado')::int as apagadas,
           coalesce(sum(v.monto) filter (where v.estado in ('vencido', 'apagado')), 0) as monto_vencidas
      from public.cuentas_cobro_vista v group by v.moneda)
  select coalesce(c.moneda, e.moneda), coalesce(e.total, 0), coalesce(c.cuentas, 0),
         coalesce(c.vencidas, 0), coalesce(c.apagadas, 0), coalesce(c.monto_vencidas, 0)
    from ctas c full join entro e on e.moneda = c.moneda;
$$;

revoke execute on function public.cuenta_cobro_guardar(uuid, text, numeric, text, date, text, uuid[]) from public, anon;
revoke execute on function public.cuenta_cobro_apagar(uuid, boolean) from public, anon;
revoke execute on function public.cuenta_cobro_borrar(uuid) from public, anon;
revoke execute on function public.cuenta_cobro_pagar(uuid, date, date, numeric, text, text, text, date, uuid) from public, anon;
revoke execute on function public.pago_reporte_rechazar(uuid, text) from public, anon;
revoke execute on function public.pago_reportar(numeric, date, text, text, text) from public, anon;
revoke execute on function public.mi_reporte_de_pago() from public, anon;
revoke execute on function public.cobros_ajustes_guardar(boolean, boolean, int, int, text, text) from public, anon;
revoke execute on function public.cuentas_cobro_resumen() from public, anon;
grant execute on function public.cuenta_cobro_guardar(uuid, text, numeric, text, date, text, uuid[]) to authenticated;
grant execute on function public.cuenta_cobro_apagar(uuid, boolean) to authenticated;
grant execute on function public.cuenta_cobro_borrar(uuid) to authenticated;
grant execute on function public.cuenta_cobro_pagar(uuid, date, date, numeric, text, text, text, date, uuid) to authenticated;
grant execute on function public.pago_reporte_rechazar(uuid, text) to authenticated;
grant execute on function public.pago_reportar(numeric, date, text, text, text) to authenticated;
grant execute on function public.mi_reporte_de_pago() to authenticated;
grant execute on function public.cobros_ajustes_guardar(boolean, boolean, int, int, text, text) to authenticated;
grant execute on function public.cuentas_cobro_resumen() to authenticated;

-- ------------------------------------------------------------ 7. el candado
-- Un alumno con cuenta de cobro: decide la cuenta (apagada = fuera; si no, entra,
-- aunque esté vencida dentro de los días de gracia o con el apagado automático
-- apagado). Sin cuenta: lo de siempre (paquete, prueba, temporal).
-- Va ANTES del interruptor «exigido» a propósito: apagar a mano tiene que
-- servir aunque el acceso no se exija.
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
    -- Cobros: la cuenta de la familia decide.
    when exists (select 1 from public.cuenta_cobro_alumnos ca where ca.alumno_id = auth.uid()) then
      coalesce((select interno.cuenta_cobro_estado(ca.cuenta_id)->>'estado'
                  from public.cuenta_cobro_alumnos ca where ca.alumno_id = auth.uid()), '') <> 'apagado'
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

-- mi_acceso(): con cuenta de cobro contesta «cobro», con lo que el aviso
-- necesita para que pague solo (monto, SINPE, si ya mandó comprobante).
create or replace function public.mi_acceso()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_rol text; v_admin boolean; v_exigido boolean; v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
        v_hasta date; v_nombre text; v_vigente boolean := public.acceso_vigente(); v_prueba timestamptz;
        v_temporal timestamptz; v_detalle text; v_empieza timestamptz; v_origen text;
        v_cuenta uuid; v_est jsonb; v_c public.cuentas_cobro; v_aj public.cobros_ajustes;
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
  select ca.cuenta_id into v_cuenta from public.cuenta_cobro_alumnos ca where ca.alumno_id = auth.uid();
  if v_cuenta is not null then
    v_est := interno.cuenta_cobro_estado(v_cuenta);
    select * into v_c from public.cuentas_cobro where id = v_cuenta;
    select * into v_aj from public.cobros_ajustes where id;
    return jsonb_build_object('vigente', v_vigente, 'motivo', 'cobro', 'exigido', v_exigido,
      'estado', v_est->>'estado', 'hasta', v_est->>'activo_hasta', 'dias', (v_est->>'dias')::int,
      'apaga_el', v_est->>'apaga_el', 'apagada_a_mano', (v_est->>'apagada_a_mano')::boolean,
      'monto', v_c.monto, 'moneda', v_c.moneda,
      'sinpe_numero', v_aj.sinpe_numero, 'sinpe_nombre', v_aj.sinpe_nombre,
      'reporte_pendiente', exists (select 1 from public.pagos_reportados r
                                    where r.cuenta_id = v_cuenta and r.estado = 'pendiente'));
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

-- ------------------------------------------------------------ 8. los avisos solos
-- Cada aviso sale una vez por periodo: lo garantiza el índice (cuenta, tipo,
-- hasta qué día estaba pagada, correo), no un if. Se apunta DESPUÉS de que
-- Resend lo acepte (lo hace la Edge Function).
create table public.avisos_cuenta (
  id bigint generated always as identity primary key,
  cuenta_id uuid not null references public.cuentas_cobro(id) on delete cascade,
  tipo text not null check (tipo in ('antes', 'vencio', 'antes_de_apagar')),
  activo_hasta date not null,
  correo text not null,
  enviado_at timestamptz not null default now(),
  unique (cuenta_id, tipo, activo_hasta, correo)
);
alter table public.avisos_cuenta enable row level security;
revoke all on public.avisos_cuenta from anon, authenticated;
create policy avisos_cuenta_lee on public.avisos_cuenta for select to authenticated
  using ((select public.soy_admin()) or interno.veo_cuenta_cobro(cuenta_id));

-- Qué aviso le toca hoy a cada cuenta. Solo si quien administra encendió los
-- avisos; con eso apagado no devuelve nada. Es de la Edge Function (service
-- role): nadie con sesión la llama.
create or replace function public.cuentas_para_avisar()
returns table (cuenta_id uuid, tipo text, activo_hasta date, apaga_el date, nombre text,
               monto numeric, moneda text, alumnos uuid[])
language sql stable security definer
set search_path = '' set row_security = off
as $$
  with aj as (select * from public.cobros_ajustes where id),
  e as (
    select c.id, c.nombre, c.monto, c.moneda, interno.cuenta_cobro_estado(c.id) as est
      from public.cuentas_cobro c
     where (select avisos_auto from aj) and not c.apagada),
  t as (
    select e.*, (est->>'dias')::int as dias, (est->>'activo_hasta')::date as hasta,
           (est->>'apaga_el')::date as apaga, est->>'estado' as estado
      from e)
  select t.id,
         case
           when t.estado = 'apagado' then null
           when t.apaga is not null and (now() at time zone 'America/Costa_Rica')::date >= t.apaga - 1 then 'antes_de_apagar'
           when t.dias between 1 and greatest((select dias_aviso_antes from aj), 1) then 'antes'
           when t.dias between -3 and 0 then 'vencio'
         end,
         t.hasta, t.apaga, t.nombre, t.monto, t.moneda,
         (select array_agg(ca.alumno_id order by ca.agregado_at) from public.cuenta_cobro_alumnos ca where ca.cuenta_id = t.id)
    from t
   where t.estado <> 'apagado'
     and ((t.apaga is not null and (now() at time zone 'America/Costa_Rica')::date >= t.apaga - 1)
          or t.dias between 1 and greatest((select dias_aviso_antes from aj), 1)
          or t.dias between -3 and 0);
$$;
revoke execute on function public.cuentas_para_avisar() from public, anon, authenticated;

-- El disparador de pg_cron: el mismo secreto del Vault que las tandas de cobros.
-- Si los avisos están apagados, ni siquiera llama a la función.
create or replace function public.disparar_avisos_cuentas()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare secreto text;
begin
  if not coalesce((select avisos_auto from public.cobros_ajustes where id), false) then
    return;
  end if;
  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'tanda_cobros_secreto';
  if secreto is null or secreto = '' then
    raise warning 'No hay secreto de tanda: no se mandaron los avisos de las cuentas.';
    return;
  end if;
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/cobros-recordatorios',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secreto),
    body := jsonb_build_object('action', 'tanda_cuentas'),
    timeout_milliseconds := 120000);
end;
$$;
revoke execute on function public.disparar_avisos_cuentas() from public, anon, authenticated;

-- 13:30 UTC = 7:30 de la mañana en Costa Rica.
select cron.schedule('cobros-cuentas-avisos', '30 13 * * *',
                     $cron$select public.disparar_avisos_cuentas();$cron$);

-- ------------------------------------------------------------ 9. auditoría
create trigger auditar after insert or update or delete on public.cuentas_cobro
  for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.cuenta_cobro_alumnos
  for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.cobros_ajustes
  for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.pagos_reportados
  for each row execute function interno.auditar();

-- ------------------------------------------------------------ 10. lo que ya había
-- Cada alumno con una mensualidad activa pasa a su cuenta, con lo que ya tenía
-- pagado como «activo hasta». Los cobros viejos se quedan donde están (y en
-- cobros.html); las tareas viejas (cobros-generar y sus avisos) siguen
-- apagadas desde el 4/11 y NO deben volver a encenderse: cobrarían dos veces.
-- Hoy los 60 alumnos con mensualidad están además en un paquete vigente, así
-- que pasar a «decide la cuenta» no le cierra la Academia a nadie: con el
-- apagado automático apagado, ninguna cuenta queda fuera.
do $$
declare r record; v_id uuid;
begin
  for r in
    with s as (
      select su.student_id,
             sum(round(pl.monto * (1 - coalesce(su.descuento_pct, 0) / 100.0)))::numeric(12,2) as monto,
             min(pl.moneda) as moneda,
             max(su.pagado_hasta) as pagado_hasta,
             min(su.inicio) as inicio
        from public.suscripciones su join public.planes_cobro pl on pl.id = su.plan_id
       where su.activa and (su.fin is null or su.fin >= (now() at time zone 'America/Costa_Rica')::date)
       group by su.student_id
      having count(distinct pl.moneda) = 1),
    pag as (
      select k.student_id, max(k.periodo_fin) as fin
        from public.cobros_vista k
       where k.suscripcion_id is not null and k.situacion = 'pagado'
       group by k.student_id)
    select s.student_id, s.monto, s.moneda, p.full_name,
           coalesce(greatest(s.pagado_hasta, g.fin), s.inicio - 1) as hasta
      from s join public.profiles p on p.id = s.student_id and p.role = 'alumno'
      left join pag g on g.student_id = s.student_id
     where s.monto > 0
  loop
    insert into public.cuentas_cobro (nombre, monto, moneda, activo_hasta_base, creado_por, nota)
    values (coalesce(nullif(btrim(r.full_name), ''), 'Alumno'), r.monto, r.moneda, r.hasta, null,
            'Pasada de la mensualidad vieja el 18/11/2026.')
    returning id into v_id;
    insert into public.cuenta_cobro_alumnos (cuenta_id, alumno_id) values (v_id, r.student_id);
  end loop;
end $$;
