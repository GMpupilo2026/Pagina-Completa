-- Recibos por academia, pagos adelantados y lo que corrige quien supervisa
-- (1 de 3: las tablas, el prefijo y quién corrige; 2: las vistas y el
-- recibo; 3: las funciones que se llaman desde la página y los recibos de
-- los pagos que ya había).
--
-- 1. Cada pago queda en un RECIBO con su número propio por academia
--    (R-ADAPZ-2026-0001). El número lo da un contador en la base
--    (recibo_contadores), no un max()+1: dos pagos al mismo tiempo no pueden
--    llevarse el mismo.
-- 2. Los pagos ya no se insertan directo: los escriben registrar_pago(),
--    pago_adelantado() y registrar_cobro_pagado(), que validan y dan el recibo
--    en la misma transacción. Un pago sin recibo no puede existir.
-- 3. Pagar por adelantado es emitir los cobros futuros de la suscripción con la
--    MISMA regla de generar_cobros() (interno.emitir_cobros) y pagarlos: el
--    índice único (suscripcion_id, periodo_inicio) hace que la corrida diaria
--    no los vuelva a emitir.
-- 4. Corregir lo ya registrado (el monto de un cobro, un pago, anular un
--    recibo) y MANDAR el recibo a la familia es de quien supervisa al alumno
--    o de administración. Quien coordina registra, pero no corrige ni manda:
--    el supervisor revisa el recibo antes de que salga, y un pago borrado en
--    silencio es plata que desaparece.
-- 5. Un recibo anulado no se borra (es el registro de lo que pasó): sus pagos
--    dejan de contar en cobros_vista.

-- ------------------------------------------------------------ el prefijo
alter table public.academias add column prefijo_recibo text
  constraint academias_prefijo_recibo_check
  check (prefijo_recibo ~ '^[A-Z0-9]{2,10}$' and prefijo_recibo <> 'AI');

-- Sin prefijo elegido, la primera palabra del nombre (ADAPZ, CENFOTEC, CCDR).
create or replace function interno.prefijo_de_nombre(p_nombre text)
returns text language sql immutable set search_path = '' as $$
  select case when length(x) >= 2 and x <> 'AI' then x else 'AC' end
    from (select upper(left(regexp_replace(
            translate(split_part(btrim(coalesce(p_nombre, '')), ' ', 1),
                      'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU'),
            '[^A-Za-z0-9]', '', 'g'), 8)) as x) s;
$$;

-- El prefijo que usan HOY los recibos de una academia (null = Ajedrez Integral).
create or replace function public.prefijo_recibo(p_academia uuid)
returns text language sql stable security invoker set search_path = '' as $$
  select coalesce((select coalesce(a.prefijo_recibo, interno.prefijo_de_nombre(a.nombre))
                     from public.academias a where a.id = p_academia), 'AI');
$$;

create or replace function public.academia_guardar_prefijo_recibo(p_academia uuid, p_prefijo text)
returns text language plpgsql security definer set search_path = '' as $$
declare v text := nullif(upper(btrim(coalesce(p_prefijo, ''))), '');
begin
  if not coalesce(public.soy_admin() or public.supervisa_academia(p_academia), false) then
    raise exception 'El prefijo de los recibos lo cambia quien supervisa la academia o administración.'
      using errcode = '42501';
  end if;
  if v is not null and (v !~ '^[A-Z0-9]{2,10}$' or v = 'AI') then
    raise exception 'El prefijo lleva de 2 a 10 letras o números, sin espacios (y no puede ser AI).'
      using errcode = '22023';
  end if;
  update public.academias set prefijo_recibo = v where id = p_academia;
  if not found then raise exception 'Esa academia no existe.' using errcode = 'P0002'; end if;
  return public.prefijo_recibo(p_academia);
end;
$$;

-- ------------------------------------------------------------ las tablas
create table public.recibo_contadores (
  prefijo text not null,
  anio integer not null,
  ultimo integer not null,
  primary key (prefijo, anio)
);
alter table public.recibo_contadores enable row level security;
revoke all on public.recibo_contadores from anon, authenticated;

create table public.recibos (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  academia_id uuid references public.academias(id) on delete set null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  fecha date not null,
  metodo text not null check (metodo in ('sinpe', 'transferencia', 'efectivo', 'tarjeta', 'otro')),
  referencia text check (length(referencia) <= 120),
  nota text check (length(nota) <= 300),
  estado text not null default 'emitido' check (estado in ('emitido', 'anulado')),
  anulado_motivo text check (length(anulado_motivo) <= 300),
  -- Cómo le llegó a la familia: por correo (enviado_at/enviado_a) o
  -- impreso, en mano. Null = todavía nadie lo revisó y lo entregó.
  entrega text check (entrega in ('correo', 'mano')),
  enviado_at timestamptz,
  enviado_a text[],
  emitido_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index recibos_por_alumno on public.recibos (student_id);
create index recibos_academia_id_fk on public.recibos (academia_id);
create index recibos_emitido_por_fk on public.recibos (emitido_por);
create index recibos_por_fecha on public.recibos (fecha desc, created_at desc);
alter table public.recibos enable row level security;
revoke all on public.recibos from anon;
revoke insert, update, delete on public.recibos from authenticated;
grant select on public.recibos to authenticated;

create trigger auditar after insert or delete or update on public.recibos
  for each row execute function interno.auditar();

create policy recibos_coordinacion on public.recibos for select to authenticated
  using (public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(student_id));
create policy recibos_lee_alumno on public.recibos for select to authenticated
  using (student_id = (select auth.uid()));

alter table public.pagos add column recibo_id uuid references public.recibos(id) on delete set null;
create index pagos_recibo_id_fk on public.pagos (recibo_id);

-- ------------------------------------------- quién corrige lo registrado
create or replace function interno.corrijo_cobros_de(p_alumno uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.soy_admin()
                  or (public.soy_supervisor() and public.supervisado_por_mi(p_alumno)), false);
$$;

-- La misma pregunta, para la Edge Function que manda el recibo (la llama con
-- el JWT de quien pide el envío) y para la pantalla.
create or replace function public.puedo_corregir_cobros(p_alumno uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select interno.corrijo_cobros_de(p_alumno);
$$;
revoke execute on function public.puedo_corregir_cobros(uuid) from public, anon;
grant execute on function public.puedo_corregir_cobros(uuid) to authenticated;

-- Lo que se escribe de un pago, ya registrado, lo cambia solo quien corrige.
-- Insertar: solo por las funciones (se le quita el permiso a authenticated).
-- pagos_coordinacion sigue siendo la puerta de quien coordina (ver y, por la
-- RLS, nada más): su WITH CHECK pasa a pedir que corrija, y dos políticas
-- RESTRICTIVAS hacen lo mismo con update y delete, que una permisiva sola no
-- puede cerrar.
alter policy pagos_coordinacion on public.pagos
  with check (exists (select 1 from public.cobros c where c.id = pagos.cobro_id and interno.corrijo_cobros_de(c.student_id)));
create policy pagos_cambia_solo_supervision on public.pagos as restrictive for update to authenticated
  using (exists (select 1 from public.cobros c where c.id = pagos.cobro_id and interno.corrijo_cobros_de(c.student_id)))
  with check (exists (select 1 from public.cobros c where c.id = pagos.cobro_id and interno.corrijo_cobros_de(c.student_id)));
create policy pagos_borra_solo_supervision on public.pagos as restrictive for delete to authenticated
  using (exists (select 1 from public.cobros c where c.id = pagos.cobro_id and interno.corrijo_cobros_de(c.student_id)));
revoke insert on public.pagos from authenticated;

-- Un cobro emitido: quien coordina lo anula; cambiarle el monto, el concepto o
-- las fechas, o volver a abrir uno anulado, es de quien corrige. Con la
-- service role o pg_cron (sin auth.uid()) no se mira. suscripcion_id no
-- cuenta: lo pone en NULL el ON DELETE SET NULL al borrar un plan.
create or replace function interno.cobros_corrige_supervision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_pagado numeric;
begin
  if (select auth.uid()) is null then return new; end if;
  if (new.monto, new.concepto, new.vence, new.periodo_inicio, new.periodo_fin, new.student_id, new.moneda)
       is distinct from (old.monto, old.concepto, old.vence, old.periodo_inicio, old.periodo_fin, old.student_id, old.moneda)
     or (old.estado = 'anulado' and new.estado = 'emitido') then
    if not interno.corrijo_cobros_de(old.student_id) then
      raise exception 'Corregir un cobro ya emitido es de quien supervisa la academia o de administración.'
        using errcode = '42501';
    end if;
  end if;
  if new.monto is distinct from old.monto then
    select coalesce(sum(p.monto), 0) into v_pagado
      from public.pagos p
     where p.cobro_id = new.id
       and not exists (select 1 from public.recibos r where r.id = p.recibo_id and r.estado = 'anulado');
    if new.monto < v_pagado then
      raise exception 'Ese cobro ya tiene % pagado: el monto no puede quedar por debajo.', v_pagado
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
create trigger cobros_corrige_supervision before update on public.cobros
  for each row execute function interno.cobros_corrige_supervision();

