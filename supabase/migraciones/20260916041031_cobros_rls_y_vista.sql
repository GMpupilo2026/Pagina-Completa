-- ============================================================================
-- Quién ve y toca la plata.
--
-- Esto NO es una función de profesor: la maneja quien coordina o administra
-- (soy_coordinador() = es_coordinador or is_admin). Un profesor cualquiera no
-- tiene por qué ver cuánto paga cada alumno. El alumno sí ve LO SUYO, porque es
-- su propio recibo, y de solo lectura.
-- ============================================================================

alter table public.planes_cobro      enable row level security;
alter table public.suscripciones     enable row level security;
alter table public.cobros            enable row level security;
alter table public.pagos             enable row level security;
alter table public.datos_facturacion enable row level security;
alter table public.avisos_cobro      enable row level security;

-- Supabase le da permisos de tabla a anon por omisión en todo lo nuevo de
-- public y confía en la RLS. Acá el público no tiene nada que hacer: se le
-- quitan de raíz, una puerta menos que dependa de que la política esté bien.
revoke all on public.planes_cobro,      public.suscripciones, public.cobros,
              public.pagos,             public.datos_facturacion,
              public.avisos_cobro  from anon;

-- ------------------------------------------------------------------- planes
create policy planes_lee_coordinacion on public.planes_cobro
  for select to authenticated using (public.soy_coordinador());
create policy planes_escribe_coordinacion on public.planes_cobro
  for all to authenticated
  using (public.soy_coordinador()) with check (public.soy_coordinador());

-- ------------------------------------------------------------ suscripciones
create policy suscripciones_lee_alumno on public.suscripciones
  for select to authenticated using (student_id = auth.uid());
create policy suscripciones_coordinacion on public.suscripciones
  for all to authenticated
  using (public.soy_coordinador()) with check (public.soy_coordinador());

-- ------------------------------------------------------------------- cobros
create policy cobros_lee_alumno on public.cobros
  for select to authenticated using (student_id = auth.uid());
create policy cobros_coordinacion on public.cobros
  for all to authenticated
  using (public.soy_coordinador()) with check (public.soy_coordinador());

-- -------------------------------------------------------------------- pagos
create policy pagos_lee_alumno on public.pagos
  for select to authenticated
  using (exists (select 1 from public.cobros c
                 where c.id = pagos.cobro_id and c.student_id = auth.uid()));
create policy pagos_coordinacion on public.pagos
  for all to authenticated
  using (public.soy_coordinador()) with check (public.soy_coordinador());

-- ------------------------------------------------------- datos_facturacion
create policy facturacion_lee_alumno on public.datos_facturacion
  for select to authenticated using (student_id = auth.uid());
create policy facturacion_coordinacion on public.datos_facturacion
  for all to authenticated
  using (public.soy_coordinador()) with check (public.soy_coordinador());

-- ------------------------------------------------------------------- avisos
-- Solo se leen (para saber qué ya se mandó). Los escribe la Edge Function con
-- la service role, que se salta la RLS.
create policy avisos_lee_coordinacion on public.avisos_cobro
  for select to authenticated using (public.soy_coordinador());

-- ============================================================================
-- La vista que hace la cuenta: cuánto se pagó, cuánto falta y en qué situación
-- está cada cobro. security_invoker para que siga mandando la RLS de arriba.
-- ============================================================================
create or replace view public.cobros_vista
with (security_invoker = on) as
select
  c.id, c.student_id, c.suscripcion_id, c.consecutivo, c.concepto,
  c.periodo_inicio, c.periodo_fin, c.monto, c.moneda, c.vence, c.estado,
  c.anulado_motivo, c.created_at,
  coalesce(p.pagado, 0)::numeric(12,2)              as pagado,
  (c.monto - coalesce(p.pagado, 0))::numeric(12,2)  as saldo,
  p.ultimo_pago,
  case
    when c.estado = 'anulado'              then 'anulado'
    when coalesce(p.pagado, 0) >= c.monto  then 'pagado'
    when c.vence < current_date            then 'vencido'
    else 'pendiente'
  end                                                as situacion,
  case when c.estado = 'emitido' and c.vence < current_date
            and coalesce(p.pagado, 0) < c.monto
       then (current_date - c.vence) else 0 end      as dias_atraso
from public.cobros c
left join lateral (
  select sum(monto) as pagado, max(fecha) as ultimo_pago
  from public.pagos where cobro_id = c.id
) p on true;

comment on view public.cobros_vista is
  'Cada cobro con lo pagado, el saldo y su situación (pendiente / vencido / pagado / anulado). La situación se calcula, no se guarda.';

revoke all on public.cobros_vista from anon;
grant select on public.cobros_vista to authenticated;
