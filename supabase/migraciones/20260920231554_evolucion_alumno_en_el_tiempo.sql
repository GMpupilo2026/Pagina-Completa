-- Cómo viene un alumno SEMANA A SEMANA.
--
-- Informes contaba todo desde siempre: un total acumulado no contesta "¿está
-- mejor que hace tres meses?", que es la pregunta del entrenador. Los números
-- ya estaban en las mismas tablas; lo que faltaba era partirlos por periodo.
--
-- Es SECURITY INVOKER como el resto de las funciones de informes: quién puede
-- pedir la evolución de quién lo sigue decidiendo la RLS de cada tabla, y de
-- regalo un alumno que la llama recibe solo lo suyo — la misma función sirve
-- para las dos pantallas y la cuenta no queda escrita dos veces.
create or replace function public.evolucion_alumno(
    p_alumno   uuid default auth.uid(),
    p_semanas  int  default 12
)
returns table (
    semana        date,
    ejercicios    int,
    dias_activos  int,   -- días con 5 o más ejercicios: el MISMO criterio de
                         -- progreso_dias_y_racha() y del informe a la casa
    dias_tocados  int,   -- días con al menos uno, para el matiz
    minutos       int,
    respuestas    int,
    aciertos      int
)
language sql
stable
set search_path = public
as $$
with limites as (
    -- Las semanas se cuentan en hora de Costa Rica, igual que los días de la
    -- racha: quien entrena a las once de la noche no puede caer en la semana
    -- siguiente por el huso del servidor.
    select date_trunc('week', (now() at time zone 'America/Costa_Rica')::date)::date as ultima,
           (date_trunc('week', (now() at time zone 'America/Costa_Rica')::date)
            - ((greatest(p_semanas, 1) - 1) * interval '7 days'))::date as primera
),
-- La rejilla completa va primero: una semana sin nada tiene que salir en CERO
-- y no desaparecer. Sin esto el gráfico junta dos semanas separadas por un mes
-- vacío y dibuja una línea que sube, cuando lo que pasó fue que no entró.
rejilla as (
    select generate_series(l.primera, l.ultima, interval '7 days')::date as semana
    from limites l
),
dias as (
    select date_trunc('week', (tp.created_at at time zone 'America/Costa_Rica')::date)::date as semana,
           (tp.created_at at time zone 'America/Costa_Rica')::date as dia,
           count(*)::int as n
    from public.training_progress tp, limites l
    where tp.student_id = p_alumno
      and (tp.created_at at time zone 'America/Costa_Rica')::date >= l.primera
    group by 1, 2
),
entreno as (
    select d.semana,
           sum(d.n)::int as ejercicios,
           count(*) filter (where d.n >= 5)::int as dias_activos,
           count(*)::int as dias_tocados
    from dias d group by d.semana
),
pizarra as (
    select date_trunc('week', (qa.created_at at time zone 'America/Costa_Rica')::date)::date as semana,
           count(*)::int as respuestas,
           count(*) filter (where qa.is_correct)::int as aciertos
    from public.question_answers qa, limites l
    where qa.student_id = p_alumno
      and (qa.created_at at time zone 'America/Costa_Rica')::date >= l.primera
    group by 1
),
-- Los minutos se unen ANTES de sumar, con la misma función que usan Informes,
-- Tareas y el reporte de actividades: una curva que dijera otro número que la
-- tarjeta de arriba sería peor que no tenerla. La partición es la semana.
tramos as (
    select array_agg(
               row(
                   date_trunc('week', (pa.joined_at at time zone 'America/Costa_Rica')::date)::date::text,
                   pa.joined_at,
                   pa.left_at
               )::public.tramo_crudo
           ) as t
    from public.platform_activity_log pa, limites l
    where pa.student_id = p_alumno
      and (pa.joined_at at time zone 'America/Costa_Rica')::date >= l.primera
),
minutos as (
    select m.particion::date as semana, round(m.minutos)::int as minutos
    from tramos, lateral public.minutos_por_tramos(tramos.t) m
    where tramos.t is not null
)
select r.semana,
       coalesce(e.ejercicios, 0),
       coalesce(e.dias_activos, 0),
       coalesce(e.dias_tocados, 0),
       coalesce(mi.minutos, 0),
       coalesce(p.respuestas, 0),
       coalesce(p.aciertos, 0)
from rejilla r
left join entreno  e  on e.semana  = r.semana
left join pizarra  p  on p.semana  = r.semana
left join minutos  mi on mi.semana = r.semana
order by r.semana;
$$;

revoke all on function public.evolucion_alumno(uuid, int) from anon;
grant execute on function public.evolucion_alumno(uuid, int) to authenticated;