-- CENFO: cada ejercicio cuenta como MÍNIMO 2 minutos en la plataforma, y el
-- tiempo en clase también es tiempo en la plataforma en «Cómo viene».
--
-- El latido de tiempo-plataforma.js deja de contar a los 60 s sin tocar nada,
-- así que quien piensa una posición sin mover el mouse queda muy por debajo
-- de lo que de verdad trabajó (en CENFO: 149 ejercicios contra 38 minutos).
-- Para ese grupo, los minutos de ejercicios de un periodo son
--     greatest(minutos medidos, 2 × ejercicios hechos en ese periodo)
-- — «como mínimo»: si el tiempo medido ya es mayor, manda el medido. Cada
-- fila de training_progress es un ejercicio hecho (repetirlo cuenta otra vez:
-- volvió a hacerlo).
--
-- La regla vive en UN solo lugar, minutos_minimos_por_ejercicio(grupo), y la
-- usan las cuatro cuentas de tiempo: el resumen de Informes, el informe a la
-- casa, «Cómo viene» y la meta de minutos de las Tareas. Si una la aplicara y
-- otra no, la tarjeta y el correo dirían números distintos del mismo alumno.
-- El grupo se compara sin mayúsculas ni espacios: «Cenfo» y «CENFO » son el
-- mismo grupo (el mismo tropiezo que ya se llevó la videollamada por grupo).
--
-- evolucion_alumno() contaba solo platform_activity_log: la curva decía menos
-- que la tarjeta «Tiempo total en la plataforma», que ya sumaba la clase.
-- Ahora suma lo mismo que la tarjeta: clase + ejercicios.

create or replace function public.minutos_minimos_por_ejercicio(p_grupo text)
returns numeric
language sql
immutable
set search_path to 'public'
as $function$
  select case when upper(btrim(coalesce(p_grupo, ''))) = 'CENFO' then 2 else 0 end::numeric;
$function$;

revoke all on function public.minutos_minimos_por_ejercicio(text) from public, anon;
grant execute on function public.minutos_minimos_por_ejercicio(text) to authenticated, service_role;

create or replace function public.informes_resumen_alumnos()
 returns TABLE(id uuid, full_name text, email text, grupo text, elo integer, elo_tipo text, elo_actualizado timestamp with time zone, respuestas integer, correctas integer, calificadas integer, clases_asistidas integer, minutos_clase double precision, minutos_ejercicios double precision, puzzles integer, lecciones integer, mejor_coord integer, practicar_series integer, practicar_estrellas integer, mate1 integer, mate2 integer, mate3 integer, tactica integer, concentracion integer, cursos_temas integer)
 language sql
 stable
 set search_path to 'public'
as $function$
with alumnos as (
  select p.id, p.full_name, p.email, p.grupo, p.elo, p.elo_tipo, p.elo_actualizado
  from public.profiles p
  where p.role = 'alumno'
),
respuestas as (
  select qa.student_id,
         count(*)::int as total,
         count(*) filter (where qa.is_correct)::int as correctas,
         count(*) filter (where qa.is_correct is not null)::int as calificadas
  from public.question_answers qa
  join alumnos a on a.id = qa.student_id
  group by qa.student_id
),
asistencia as (
  -- Solo cuentan las clases ya cerradas, como en la tabla de asistencia.
  select ca.student_id, count(*)::int as clases
  from public.class_attendance ca
  join public.class_sessions cs on cs.id = ca.session_id and cs.ended_at is not null
  join alumnos a on a.id = ca.student_id
  group by ca.student_id
),
-- Tiempo en la plataforma: minutos_por_tramos() hace la cuenta (unir tramos
-- superpuestos), acá solo se arman los dos arreglos, uno por origen.
minutos_clase as (
  select particion::uuid as student_id, minutos
  from public.minutos_por_tramos(
    (select array_agg(ROW(cpl.student_id::text, cpl.joined_at, cpl.left_at)::public.tramo_crudo)
     from public.class_presence_log cpl join alumnos a on a.id = cpl.student_id)
  )
),
minutos_ejercicios as (
  select particion::uuid as student_id, minutos
  from public.minutos_por_tramos(
    (select array_agg(ROW(pal.student_id::text, pal.joined_at, pal.left_at)::public.tramo_crudo)
     from public.platform_activity_log pal join alumnos a on a.id = pal.student_id)
  )
),
-- Progreso de entrenamiento. Un mismo ejercicio repetido cuenta una sola vez
-- (de ahí los count(distinct)), y de Coordenadas se guarda la mejor marca.
entreno as (
  select tp.student_id,
    count(*)::int as hechos,
    count(distinct tp.detail->>'puzzle_id')
      filter (where tp.activity = '4x4' and coalesce(tp.detail->>'puzzle_id', '') <> '')::int as puzzles,
    count(distinct tp.detail->>'lesson_id')
      filter (where tp.activity = 'aprender' and coalesce(tp.detail->>'lesson_id', '') <> '')::int as lecciones,
    coalesce(max(case when tp.activity = 'coordenadas' and jsonb_typeof(tp.detail->'score') = 'number'
                      then (tp.detail->>'score')::numeric end), 0)::int as mejor_coord,
    count(distinct tp.detail->>'puzzle_id')
      filter (where tp.activity = 'mates' and tp.detail->>'category' = 'mate1'
              and coalesce(tp.detail->>'puzzle_id', '') <> '')::int as mate1,
    count(distinct tp.detail->>'puzzle_id')
      filter (where tp.activity = 'mates' and tp.detail->>'category' = 'mate2'
              and coalesce(tp.detail->>'puzzle_id', '') <> '')::int as mate2,
    count(distinct tp.detail->>'puzzle_id')
      filter (where tp.activity = 'mates' and tp.detail->>'category' = 'mate3'
              and coalesce(tp.detail->>'puzzle_id', '') <> '')::int as mate3,
    count(distinct tp.detail->>'puzzle_id')
      filter (where tp.activity = 'tactica' and coalesce(tp.detail->>'puzzle_id', '') <> '')::int as tactica,
    count(distinct ((tp.detail->>'nivel') || '/' || (tp.detail->>'ejercicio')))
      filter (where tp.activity = 'concentracion'
              and coalesce(tp.detail->>'nivel', '') <> ''
              and coalesce(tp.detail->>'ejercicio', '') <> '')::int as concentracion,
    count(distinct ((tp.detail->>'curso') || '/' || (tp.detail->>'leccion')))
      filter (where tp.activity = 'curso'
              and coalesce(tp.detail->>'curso', '') <> ''
              and coalesce(tp.detail->>'leccion', '') <> '')::int as cursos_temas
  from public.training_progress tp
  join alumnos a on a.id = tp.student_id
  group by tp.student_id
),
-- Practicar guarda una fila por intento: de cada serie vale su mejor estrella,
-- y solo después se suman. Por eso va en dos pasos y no en un solo agregado.
practicar_series as (
  select tp.student_id,
         tp.detail->>'set_id' as serie,
         max((tp.detail->>'stars')::numeric) as estrellas
  from public.training_progress tp
  join alumnos a on a.id = tp.student_id
  where tp.activity = 'practicar'
    and coalesce(tp.detail->>'set_id', '') <> ''
    and jsonb_typeof(tp.detail->'stars') = 'number'
  group by tp.student_id, tp.detail->>'set_id'
),
practicar as (
  select student_id, count(*)::int as series, coalesce(sum(estrellas), 0)::int as estrellas
  from practicar_series
  group by student_id
)
select a.id, a.full_name, a.email, a.grupo, a.elo, a.elo_tipo, a.elo_actualizado,
       coalesce(r.total, 0), coalesce(r.correctas, 0), coalesce(r.calificadas, 0),
       coalesce(asi.clases, 0),
       coalesce(mc.minutos, 0)::double precision,
       -- CENFO: cada ejercicio vale como mínimo 2 minutos (ver minutos_minimos_por_ejercicio).
       greatest(coalesce(me.minutos, 0),
                public.minutos_minimos_por_ejercicio(a.grupo) * coalesce(e.hechos, 0))::double precision,
       coalesce(e.puzzles, 0), coalesce(e.lecciones, 0), coalesce(e.mejor_coord, 0),
       coalesce(pr.series, 0), coalesce(pr.estrellas, 0),
       coalesce(e.mate1, 0), coalesce(e.mate2, 0), coalesce(e.mate3, 0),
       coalesce(e.tactica, 0), coalesce(e.concentracion, 0), coalesce(e.cursos_temas, 0)
from alumnos a
left join respuestas r on r.student_id = a.id
left join asistencia asi on asi.student_id = a.id
left join minutos_clase mc on mc.student_id = a.id
left join minutos_ejercicios me on me.student_id = a.id
left join entreno e on e.student_id = a.id
left join practicar pr on pr.student_id = a.id
order by coalesce(nullif(a.full_name, ''), a.email) collate "es-CR-x-icu";
$function$;

create or replace function public.informe_de_alumno(
  p_alumno uuid, p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
with alumno as (
  select p.id, coalesce(nullif(p.full_name, ''), p.email) as nombre, p.grupo, p.elo
  from public.profiles p where p.id = p_alumno and p.role = 'alumno'
),
-- Mismo criterio de tiempo que el resumen general (minutos_por_tramos): una
-- ventana sin cierre vale como mucho un latido, y dos pestañas a la vez se
-- solapan, así que los tramos se unen antes de sumar.
minutos_clase as (
  select minutos from public.minutos_por_tramos(
    (select array_agg(ROW('x', cpl.joined_at, cpl.left_at)::public.tramo_crudo)
     from public.class_presence_log cpl
     where cpl.student_id = p_alumno and cpl.joined_at >= p_desde and cpl.joined_at < p_hasta)
  )
),
minutos_ejercicios as (
  select minutos from public.minutos_por_tramos(
    (select array_agg(ROW('x', pal.joined_at, pal.left_at)::public.tramo_crudo)
     from public.platform_activity_log pal
     where pal.student_id = p_alumno and pal.joined_at >= p_desde and pal.joined_at < p_hasta)
  )
),
respuestas as (
  select count(*)::int as total,
         count(*) filter (where qa.is_correct)::int as correctas
  from public.question_answers qa
  where qa.student_id = p_alumno and qa.created_at >= p_desde and qa.created_at < p_hasta
),
asistencia as (
  select count(*)::int as clases
  from public.class_attendance ca
  join public.class_sessions cs on cs.id = ca.session_id and cs.ended_at is not null
  where ca.student_id = p_alumno and ca.joined_at >= p_desde and ca.joined_at < p_hasta
),
-- En cuántos días distintos entrenó, en hora de Costa Rica, y cuántos
-- ejercicios hizo (para el mínimo por ejercicio de CENFO).
dias as (
  select count(distinct ((tp.created_at at time zone 'America/Costa_Rica')::date))::int as cuantos,
         count(*)::int as hechos
  from public.training_progress tp
  where tp.student_id = p_alumno and tp.created_at >= p_desde and tp.created_at < p_hasta
),
-- Qué hizo en Entrenamiento, por actividad y sin repetir el mismo ejercicio.
entreno as (
  select tp.activity,
         count(distinct coalesce(tp.detail->>'puzzle_id', tp.detail->>'lesson_id',
                                 tp.detail->>'set_id',
                                 (tp.detail->>'nivel') || '/' || (tp.detail->>'ejercicio'),
                                 tp.id::text))::int as cuantos,
         max(case when tp.activity = 'coordenadas' and jsonb_typeof(tp.detail->'score') = 'number'
                  then (tp.detail->>'score')::int end) as mejor
  from public.training_progress tp
  where tp.student_id = p_alumno and tp.created_at >= p_desde and tp.created_at < p_hasta
  group by tp.activity
),
-- El nivel vigente, aunque el diagnóstico sea de antes del periodo: es contexto.
diagnostico as (
  select d.detalle->>'nivel_etiqueta' as nivel,
         (d.detalle->>'porcentaje') as porcentaje,
         d.fecha
  from public.informes_diagnosticos_alumnos() d
  where d.student_id = p_alumno and d.detalle is not null
),
-- El plan que su profesor le compartió. `plan->'generado'` es lo que arma
-- PlanEntrenamiento.generarPlan(): la rutina diaria, una semana por área con su
-- porqué y su objetivo medible, y la meta de Elo cuando la hay. `nota` es lo
-- único escrito a mano, y por eso en el correo va destacado.
plan_alumno as (
  select tpl.nota, tpl.updated_at, tpl.plan->'generado' as g
  from public.training_plans tpl
  where tpl.student_id = p_alumno and tpl.shared
  limit 1
)
select jsonb_build_object(
  'alumno', (select nombre from alumno),
  'grupo', (select grupo from alumno),
  'elo', (select elo from alumno),
  'desde', p_desde,
  'hasta', p_hasta,
  'dias_del_periodo', greatest(1, ceil(extract(epoch from (p_hasta - p_desde)) / 86400)::int),
  'dias_activos', coalesce((select cuantos from dias), 0),
  'minutos_clase', round(coalesce((select minutos from minutos_clase), 0)::numeric, 1),
  'minutos_ejercicios', round(greatest(
      coalesce((select minutos from minutos_ejercicios), 0)::numeric,
      public.minutos_minimos_por_ejercicio((select grupo from alumno)) * coalesce((select hechos from dias), 0)), 1),
  'clases', coalesce((select clases from asistencia), 0),
  'respuestas', coalesce((select total from respuestas), 0),
  'correctas', coalesce((select correctas from respuestas), 0),
  'entreno', coalesce((select jsonb_object_agg(activity,
                         jsonb_build_object('cuantos', cuantos, 'mejor', mejor)) from entreno), '{}'::jsonb),
  'diagnostico', (select jsonb_build_object('nivel', nivel, 'porcentaje', porcentaje, 'fecha', fecha) from diagnostico),
  'plan', (select jsonb_build_object(
             'compartido_at', updated_at,
             'nota', nota,
             'rutina', g->>'rutina',
             'meta_elo', g->'metaElo'->>'texto',
             'areas', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'titulo', s->>'titulo',
                        'objetivo', s->>'objetivo',
                        'porque', s->>'porque')
                      order by (s->>'numero')::int)
               from jsonb_array_elements(coalesce(g->'semanas', '[]'::jsonb)) s), '[]'::jsonb))
           from plan_alumno)
)
-- Las tareas y los exámenes se piden aparte, a una función SECURITY DEFINER,
-- y NO se cuentan acá: `tareas` y `examenes` están aisladas por profesor, así
-- que contándolas desde esta función —que es SECURITY INVOKER— la tanda de
-- pg_cron y la vista previa del profesor darían números distintos del mismo
-- alumno. Comprobado: una profesora que no puso esas tareas ve 0 y el alumno
-- tiene 1.
|| public.resumen_tareas_examenes(p_alumno, p_desde, p_hasta)
from alumno;
$function$;

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
minutos_ej as (
    select m.particion::date as semana, m.minutos
    from tramos, lateral public.minutos_por_tramos(tramos.t) m
    where tramos.t is not null
),
-- La clase también es tiempo en la plataforma: la tarjeta de arriba suma
-- clase + ejercicios, y la curva tiene que decir el mismo número.
tramos_clase as (
    select array_agg(
               row(
                   date_trunc('week', (cpl.joined_at at time zone 'America/Costa_Rica')::date)::date::text,
                   cpl.joined_at,
                   cpl.left_at
               )::public.tramo_crudo
           ) as t
    from public.class_presence_log cpl, limites l
    where cpl.student_id = p_alumno
      and (cpl.joined_at at time zone 'America/Costa_Rica')::date >= l.primera
),
minutos_clase as (
    select m.particion::date as semana, m.minutos
    from tramos_clase, lateral public.minutos_por_tramos(tramos_clase.t) m
    where tramos_clase.t is not null
),
minimo as (
    select public.minutos_minimos_por_ejercicio(p.grupo) as por_ejercicio
    from public.profiles p where p.id = p_alumno
),
minutos as (
    -- CENFO: los minutos de ejercicios de la semana valen como mínimo 2 por
    -- ejercicio hecho (ver minutos_minimos_por_ejercicio).
    select r.semana,
           round(coalesce(mc.minutos, 0)
                 + greatest(coalesce(me.minutos, 0),
                            coalesce((select por_ejercicio from minimo), 0) * coalesce(e.ejercicios, 0)))::int as minutos
    from rejilla r
    left join minutos_ej    me on me.semana = r.semana
    left join minutos_clase mc on mc.semana = r.semana
    left join entreno       e  on e.semana  = r.semana
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

create or replace function public.tareas_con_avance(p_alumno uuid default null::uuid, p_profesor uuid default null::uuid, p_pendientes boolean default false, p_limite integer default null::integer)
 returns table(id uuid, profesor_id uuid, profesor_nombre text, alumno_id uuid, alumno_nombre text, titulo text, instrucciones text, vence_at timestamp with time zone, disponible_desde timestamp with time zone, created_at timestamp with time zone, items jsonb, renglones integer, cumplidos integer, situacion text)
 language sql
 stable
 set search_path to 'public'
as $function$
with base as (
  select t.* from public.tareas t
  where (p_alumno   is null or t.alumno_id   = p_alumno)
    and (p_profesor is null or t.profesor_id = p_profesor)
),
avance as (
  select
    i.*,
    b.id as t_id,
    case i.meta_tipo
      when 'completar' then (case when i.completada_at is not null then 1 else 0 end)::bigint

      when 'cantidad' then (
        select count(distinct coalesce(
                 tp.detail->>'puzzle_id', tp.detail->>'lesson_id',
                 tp.detail->>'set_id',    tp.detail->>'linea_id',
                 tp.detail->>'nivel_id',  tp.detail->>'diagrama',
                 tp.id::text))
        from public.training_progress tp
        where tp.student_id = b.alumno_id
          and tp.activity = any(i.actividades)
          and (i.filtro_clave is null
               or tp.detail->>'theme'    = i.filtro_clave
               or tp.detail->>'category' = i.filtro_clave
               or tp.detail->>'linea_id' = i.filtro_clave)
      )

      -- CENFO: cada ejercicio de esas actividades hecho desde que se asignó la
      -- tarea vale como mínimo 2 minutos (ver minutos_minimos_por_ejercicio).
      when 'minutos' then greatest(coalesce((
        select floor(m.minutos)::bigint
        from public.minutos_por_tramos((
          select array_agg((i.id::text, pa.joined_at, pa.left_at)::public.tramo_crudo)
          from public.platform_activity_log pa
          where pa.student_id = b.alumno_id
            and pa.activity = any(i.actividades)
            and pa.joined_at >= b.created_at
        )) m
        limit 1), 0),
        (select floor(public.minutos_minimos_por_ejercicio(pg.grupo) * count(tp.id))::bigint
         from public.training_progress tp
         join public.profiles pg on pg.id = tp.student_id
         where tp.student_id = b.alumno_id
           and tp.activity = any(i.actividades)
           and tp.created_at >= b.created_at
         group by pg.grupo))
    end as hecho
  from public.tarea_items i
  join base b on b.id = i.tarea_id
),
marcado as (
  select a.*,
         (case when a.meta_tipo = 'completar' then a.hecho >= 1
               else a.hecho >= a.meta_cantidad end) as cumplido
  from avance a
),
resumen as (
  select m.t_id,
         jsonb_agg(jsonb_build_object(
           'id',             m.id,
           'orden',          m.orden,
           'material_tipo',  m.material_tipo,
           'material_slug',  m.material_slug,
           'material_label', m.material_label,
           'material_href',  m.material_href,
           'filtro_clave',   m.filtro_clave,
           'filtro_label',   m.filtro_label,
           'leccion',        m.leccion,
           'meta_tipo',      m.meta_tipo,
           'meta_cantidad',  m.meta_cantidad,
           'hecho',          m.hecho,
           'cumplido',       m.cumplido
         ) order by m.orden, m.id) as items,
         count(*)                           as renglones,
         count(*) filter (where m.cumplido) as cumplidos
  from marcado m
  group by m.t_id
),
final as (
  select
    b.id, b.profesor_id, pp.full_name as profesor_nombre,
    b.alumno_id, pa.full_name as alumno_nombre,
    b.titulo, b.instrucciones, b.vence_at, b.disponible_desde, b.created_at,
    coalesce(r.items, '[]'::jsonb)      as items,
    coalesce(r.renglones, 0)::integer   as renglones,
    coalesce(r.cumplidos, 0)::integer   as cumplidos,
    case
      when b.disponible_desde > now() then 'programada'
      when coalesce(r.renglones,0) > 0 and r.cumplidos >= r.renglones then 'completada'
      when b.vence_at < now() then 'vencida'
      else 'pendiente'
    end as situacion
  from base b
  left join resumen r on r.t_id = b.id
  left join public.profiles pp on pp.id = b.profesor_id
  left join public.profiles pa on pa.id = b.alumno_id
)
select * from final
where not p_pendientes or situacion <> 'completada'
order by vence_at
limit p_limite;
$function$;
