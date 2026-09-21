-- El informe de la casa suma tres cosas: sus tareas, sus exámenes y en cuántos
-- días del periodo se sentó a practicar.
--
-- Los días son la respuesta a la pregunta que de verdad hace una madre —"¿está
-- trabajando o no?"— y ninguna de las cifras que ya había la contestaba: media
-- hora puede ser una sola tarde, y veinte ejercicios también. "Practicó 4 de
-- los últimos 7 días" se entiende sin saber nada de ajedrez.
--
-- Se cuentan por fecha de COSTA RICA y no en UTC, el mismo criterio que
-- progreso_dias_y_racha(): quien entrena a las once de la noche no puede perder
-- el día por el huso horario del servidor.
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
-- En cuántos días distintos entrenó, en hora de Costa Rica.
dias as (
  select count(distinct ((tp.created_at at time zone 'America/Costa_Rica')::date))::int as cuantos
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
  'minutos_ejercicios', round(coalesce((select minutos from minutos_ejercicios), 0)::numeric, 1),
  'clases', coalesce((select clases from asistencia), 0),
  'respuestas', coalesce((select total from respuestas), 0),
  'correctas', coalesce((select correctas from respuestas), 0),
  'entreno', coalesce((select jsonb_object_agg(activity,
                         jsonb_build_object('cuantos', cuantos, 'mejor', mejor)) from entreno), '{}'::jsonb),
  'diagnostico', (select jsonb_build_object('nivel', nivel, 'porcentaje', porcentaje, 'fecha', fecha) from diagnostico)
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