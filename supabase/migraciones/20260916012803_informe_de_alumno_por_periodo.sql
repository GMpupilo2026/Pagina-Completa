-- El informe de UN alumno en UN periodo, que es lo que se le manda al
-- encargado y lo que se descarga. Es distinto de informes_resumen_alumnos():
-- aquel cuenta todo lo que lleva hecho desde siempre; este cuenta lo que hizo
-- entre dos fechas, porque "el informe de la semana" tiene que ser de la semana.
--
-- Es SECURITY INVOKER, como las otras funciones de informes: la RLS decide.
-- Un profesor solo obtiene datos de sus alumnos; la Edge Function que manda los
-- correos usa la service role, que no pasa por RLS.
create or replace function public.informe_de_alumno(
  p_alumno uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns jsonb
language sql stable security invoker set search_path = public as $$
with alumno as (
  select p.id, coalesce(nullif(p.full_name, ''), p.email) as nombre, p.grupo, p.elo
  from public.profiles p where p.id = p_alumno and p.role = 'alumno'
),
-- Mismo criterio de tiempo que el resumen general: una ventana sin cierre vale
-- como mucho un latido, y dos pestañas a la vez se solapan, así que los tramos
-- se unen antes de sumar.
tramos as (
  select 'clase'::text as origen, cpl.joined_at, cpl.left_at
  from public.class_presence_log cpl
  where cpl.student_id = p_alumno and cpl.joined_at >= p_desde and cpl.joined_at < p_hasta
  union all
  select 'ejercicios', pal.joined_at, pal.left_at
  from public.platform_activity_log pal
  where pal.student_id = p_alumno and pal.joined_at >= p_desde and pal.joined_at < p_hasta
),
intervalos as (
  select origen, joined_at as ini,
         greatest(joined_at, coalesce(left_at, least(now(), joined_at + interval '20 seconds'))) as fin
  from tramos
),
marcados as (
  select origen, ini, fin,
         case when ini <= max(fin) over (partition by origen order by ini
                                         rows between unbounded preceding and 1 preceding)
              then 0 else 1 end as nueva
  from intervalos
),
numerados as (
  select origen, ini, fin,
         sum(nueva) over (partition by origen order by ini
                          rows between unbounded preceding and current row) as estancia
  from marcados
),
estancias as (
  select origen, min(ini) as ini, max(fin) as fin
  from numerados group by origen, estancia
),
minutos as (
  select coalesce(sum(extract(epoch from (fin - ini))) filter (where origen = 'clase'), 0) / 60.0 as clase,
         coalesce(sum(extract(epoch from (fin - ini))) filter (where origen = 'ejercicios'), 0) / 60.0 as ejercicios
  from estancias
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
  'minutos_clase', round((select clase from minutos)::numeric, 1),
  'minutos_ejercicios', round((select ejercicios from minutos)::numeric, 1),
  'clases', coalesce((select clases from asistencia), 0),
  'respuestas', coalesce((select total from respuestas), 0),
  'correctas', coalesce((select correctas from respuestas), 0),
  'entreno', coalesce((select jsonb_object_agg(activity,
                         jsonb_build_object('cuantos', cuantos, 'mejor', mejor)) from entreno), '{}'::jsonb),
  'diagnostico', (select jsonb_build_object('nivel', nivel, 'porcentaje', porcentaje, 'fecha', fecha) from diagnostico)
)
from alumno;
$$;

revoke execute on function public.informe_de_alumno(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.informe_de_alumno(uuid, timestamptz, timestamptz) to authenticated, service_role;

comment on function public.informe_de_alumno(uuid, timestamptz, timestamptz) is
  'El informe de un alumno entre dos fechas: lo que se le manda al encargado y lo que se descarga.';