-- El informe de actividades para presentar a los jefes: qué clases hubo en un
-- periodo, quién asistió, cuánto duraron y qué se preguntó.
--
-- SECURITY INVOKER, igual que las funciones de informes: quién ve qué lo sigue
-- decidiendo la RLS de cada tabla. Un profesor recibe sus clases; quien
-- administra, todas. Si algún día hay que cambiar el alcance, se toca la
-- política, no esta consulta.
--
-- Los minutos se cuentan con la misma técnica que informes_resumen_alumnos
-- (unir tramos superpuestos antes de sumar): dos pestañas abiertas a la vez no
-- pueden contar el tiempo dos veces, y un informe que diga otro número que la
-- página de Informes sería peor que no tenerlo.
create or replace function public.reporte_actividades(p_desde date, p_hasta date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with rango as (
  select p_desde::timestamptz as ini, (p_hasta + 1)::timestamptz as fin
),
clases as (
  select cs.id, cs.title, cs.started_at, cs.ended_at, cs.notes, cs.summary, cs.created_by
  from public.class_sessions cs, rango r
  where cs.started_at >= r.ini and cs.started_at < r.fin
),
asistencia as (
  select ca.session_id, ca.student_id, ca.joined_at
  from public.class_attendance ca
  join clases c on c.id = ca.session_id
),
-- Minutos dentro de clase, uniendo tramos superpuestos (ver arriba).
tramos as (
  select cpl.student_id, cpl.joined_at, cpl.left_at
  from public.class_presence_log cpl
  join clases c on c.id = cpl.session_id
),
intervalos as (
  select student_id, joined_at as ini,
         greatest(joined_at, coalesce(left_at, least(now(), joined_at + interval '20 seconds'))) as fin
  from tramos
),
marcados as (
  select student_id, ini, fin,
         case when ini <= max(fin) over (partition by student_id order by ini
                                         rows between unbounded preceding and 1 preceding)
              then 0 else 1 end as nueva
  from intervalos
),
numerados as (
  select student_id, ini, fin,
         sum(nueva) over (partition by student_id order by ini
                          rows between unbounded preceding and current row) as estancia
  from marcados
),
estancias as (
  select student_id, min(ini) as ini, max(fin) as fin
  from numerados group by student_id, estancia
),
minutos as (
  select student_id, sum(extract(epoch from (fin - ini))) / 60.0 as minutos
  from estancias group by student_id
),
preguntas as (
  select q.id, q.prompt, q.created_at,
         count(qa.id)::int as respuestas,
         count(*) filter (where qa.is_correct)::int as aciertos
  from public.questions q
  left join public.question_answers qa on qa.question_id = q.id
  cross join rango r
  where q.created_at >= r.ini and q.created_at < r.fin
  group by q.id, q.prompt, q.created_at
),
por_clase as (
  select c.id, c.title, c.started_at, c.ended_at, c.notes, c.summary,
         prof.full_name as profesor,
         (select count(*) from asistencia a where a.session_id = c.id)::int as asistentes,
         coalesce((select jsonb_agg(p.full_name order by p.full_name)
                   from asistencia a join public.profiles p on p.id = a.student_id
                   where a.session_id = c.id), '[]'::jsonb) as estudiantes,
         case when c.ended_at is not null
              then round(extract(epoch from (c.ended_at - c.started_at)) / 60.0)::int
              else null end as duracion_min
  from clases c
  left join public.profiles prof on prof.id = c.created_by
),
por_estudiante as (
  select p.id, p.full_name, p.grupo,
         count(distinct a.session_id)::int as clases,
         round(coalesce(m.minutos, 0))::int as minutos
  from asistencia a
  join public.profiles p on p.id = a.student_id
  left join minutos m on m.student_id = p.id
  group by p.id, p.full_name, p.grupo, m.minutos
)
select jsonb_build_object(
  'desde', p_desde,
  'hasta', p_hasta,
  'generado', now(),
  'totales', jsonb_build_object(
    'clases', (select count(*) from clases),
    'clases_cerradas', (select count(*) from clases where ended_at is not null),
    'estudiantes', (select count(distinct student_id) from asistencia),
    'asistencias', (select count(*) from asistencia),
    'minutos', (select round(coalesce(sum(minutos), 0))::int from minutos),
    'preguntas', (select count(*) from preguntas),
    'respuestas', (select coalesce(sum(respuestas), 0)::int from preguntas),
    'aciertos', (select coalesce(sum(aciertos), 0)::int from preguntas)
  ),
  'clases', coalesce((select jsonb_agg(to_jsonb(x) order by x.started_at) from por_clase x), '[]'::jsonb),
  'estudiantes', coalesce((select jsonb_agg(to_jsonb(y) order by y.full_name) from por_estudiante y), '[]'::jsonb),
  'preguntas', coalesce((select jsonb_agg(to_jsonb(z) order by z.created_at) from preguntas z), '[]'::jsonb)
);
$$;

comment on function public.reporte_actividades(date, date) is
  'Informe de actividades de clases de un periodo, para reportes.html. SECURITY INVOKER: la RLS decide el alcance.';

-- Postgres le da el execute a PUBLIC por omisión, así que revocarlo solo de
-- anon y authenticated no haría nada. Es la piedra de generar_cobros().
revoke all on function public.reporte_actividades(date, date) from public, anon, authenticated;
grant execute on function public.reporte_actividades(date, date) to authenticated;