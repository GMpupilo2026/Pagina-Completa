-- Cobros: el día de hoy es el de Costa Rica, no el de UTC.
-- Ver «Las fechas y las horas, siempre en hora de Costa Rica» en
-- docs/decisiones/sitio-e-infraestructura.md.
--
-- La base corre en UTC, y `current_date` es el día de UTC: de las 6 de la
-- tarde a la medianoche de Costa Rica ya es «mañana». Un cobro que vence hoy
-- salía «vencido» (con un día de atraso, y en el aviso de morosidad) desde
-- las 6 p. m. del día en que todavía se podía pagar, y «lo cobrado este mes»
-- arrancaba el día 1 a las 6 p. m. del último día del mes anterior.
-- Las mismas columnas, en el mismo orden: solo cambia de qué día se habla.

create or replace view public.cobros_vista
with (security_invoker = on) as
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
    coalesce(p.pagado, 0::numeric)::numeric(12,2) as pagado,
    (c.monto - coalesce(p.pagado, 0::numeric))::numeric(12,2) as saldo,
    p.ultimo_pago,
        case
            when c.estado = 'anulado'::text then 'anulado'::text
            when coalesce(p.pagado, 0::numeric) >= c.monto then 'pagado'::text
            when c.vence < (now() at time zone 'America/Costa_Rica')::date then 'vencido'::text
            else 'pendiente'::text
        end as situacion,
        case
            when c.estado = 'emitido'::text and c.vence < (now() at time zone 'America/Costa_Rica')::date
                 and coalesce(p.pagado, 0::numeric) < c.monto
              then (now() at time zone 'America/Costa_Rica')::date - c.vence
            else 0
        end as dias_atraso
   from public.cobros c
     left join lateral ( select sum(pagos.monto) as pagado,
            max(pagos.fecha) as ultimo_pago
           from public.pagos
          where pagos.cobro_id = c.id) p on true;

create or replace function public.cobros_resumen()
returns table (
  moneda           text,
  cobrado_mes      numeric,
  pendiente        numeric,
  vencido          numeric,
  alumnos_morosos  bigint
)
language sql stable security invoker set search_path = '' as $$
  select
    v.moneda,
    coalesce(sum(v.pagado) filter (
      where v.ultimo_pago >= date_trunc('month', (now() at time zone 'America/Costa_Rica')::date)::date), 0)::numeric,
    coalesce(sum(v.saldo) filter (where v.situacion = 'pendiente'), 0)::numeric,
    coalesce(sum(v.saldo) filter (where v.situacion = 'vencido'), 0)::numeric,
    count(distinct v.student_id) filter (where v.situacion = 'vencido')
  from public.cobros_vista v
  group by v.moneda
  order by v.moneda;
$$;
