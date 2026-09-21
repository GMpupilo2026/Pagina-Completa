-- ============================================================================
-- Generar los cobros de cada periodo, y las cuentas que pinta la página.
-- ============================================================================

-- Los meses en español: to_char(..., 'TMMonth') depende del lc_time del
-- servidor, que acá no es español. Antes que confiar en eso, la tabla.
create or replace function public.mes_es(d date)
returns text language sql immutable set search_path = '' as $$
  select (array['enero','febrero','marzo','abril','mayo','junio','julio',
                'agosto','setiembre','octubre','noviembre','diciembre'])
         [extract(month from d)::int];
$$;

-- ---------------------------------------------------------------------------
-- Emite los cobros que falten hasta p_hasta. Se puede correr todas las veces
-- que se quiera: el índice único (suscripcion_id, periodo_inicio) hace que el
-- segundo intento no duplique nada.
--
-- El permiso: la llama el cron (sin sesión, auth.uid() nulo) y también la
-- página con el botón "Generar ahora". Por eso exige coordinación SOLO cuando
-- hay alguien detrás.
-- ---------------------------------------------------------------------------
create or replace function public.generar_cobros(p_hasta date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creados integer := 0;
begin
  if auth.uid() is not null and not public.soy_coordinador() then
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
    pe.periodo_inicio + (pe.dia_cobro - 1),
    auth.uid()
  from periodos pe
  on conflict (suscripcion_id, periodo_inicio) where suscripcion_id is not null
  do nothing;

  get diagnostics v_creados = row_count;
  return v_creados;
end;
$$;

-- ---------------------------------------------------------------------------
-- Las tarjetas de arriba, UNA FILA POR MONEDA: sumar colones con dólares daría
-- un número que no significa nada.
-- SECURITY INVOKER: quién ve qué lo sigue decidiendo la RLS, así que un alumno
-- que la llame recibe solo lo suyo.
-- ---------------------------------------------------------------------------
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
      where v.ultimo_pago >= date_trunc('month', current_date)::date), 0)::numeric,
    coalesce(sum(v.saldo) filter (where v.situacion = 'pendiente'), 0)::numeric,
    coalesce(sum(v.saldo) filter (where v.situacion = 'vencido'), 0)::numeric,
    count(distinct v.student_id) filter (where v.situacion = 'vencido')
  from public.cobros_vista v
  group by v.moneda
  order by v.moneda;
$$;

-- ---------------------------------------------------------------------------
-- Quién debe, cuánto y desde hace cuántos días.
-- ---------------------------------------------------------------------------
create or replace function public.cobros_morosos()
returns table (
  student_id    uuid,
  alumno        text,
  correo        text,
  grupo         text,
  moneda        text,
  deuda         numeric,
  cobros        bigint,
  dias_atraso   integer,
  vence_mas_viejo date
)
language sql stable security invoker set search_path = '' as $$
  select
    v.student_id,
    coalesce(p.full_name, p.email, 'Sin nombre'),
    p.email,
    p.grupo,
    v.moneda,
    sum(v.saldo)::numeric,
    count(*),
    max(v.dias_atraso),
    min(v.vence)
  from public.cobros_vista v
  join public.profiles p on p.id = v.student_id
  where v.situacion = 'vencido'
  group by v.student_id, p.full_name, p.email, p.grupo, v.moneda
  order by max(v.dias_atraso) desc;
$$;

revoke all on function public.generar_cobros(date) from anon;
