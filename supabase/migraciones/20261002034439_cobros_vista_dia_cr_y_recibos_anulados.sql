-- cobros_vista: el día de Costa Rica (cobros_dia_de_costa_rica) Y un recibo
-- anulado deja de contar (recibos_vistas_emitir_y_numero, #672).
--
-- cobros_dia_de_costa_rica se escribió sobre la vista de antes de #672 y se
-- aplicó después: la reemplazó entera y se perdió el filtro de los pagos de
-- un recibo anulado. Cuando se aplicó no había ningún recibo anulado (0), así
-- que ninguna cifra cambió. Esta es la suma de las dos.

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
            when c.vence < (now() at time zone 'America/Costa_Rica')::date then 'vencido'
            else 'pendiente'
        end as situacion,
        case
            when c.estado = 'emitido' and c.vence < (now() at time zone 'America/Costa_Rica')::date
                 and coalesce(p.pagado, 0) < c.monto
              then (now() at time zone 'America/Costa_Rica')::date - c.vence
            else 0
        end as dias_atraso
   from public.cobros c
     left join lateral (
       select sum(pg.monto) as pagado, max(pg.fecha) as ultimo_pago
         from public.pagos pg
        where pg.cobro_id = c.id
          and not exists (select 1 from public.recibos r where r.id = pg.recibo_id and r.estado = 'anulado')
     ) p on true;
