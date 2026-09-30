alter table public.suscripciones drop constraint suscripciones_dia_cobro_check;
alter table public.suscripciones add constraint suscripciones_dia_cobro_check
  check (dia_cobro between 1 and 31);

create or replace function public.generar_cobros(p_hasta date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creados integer := 0;
begin
  if auth.uid() is not null and not public.coordinador_puede('cobros') then
    raise exception 'Solo quien coordina o administra puede generar cobros';
  end if;

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