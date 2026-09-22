-- El reporte cuenta las tardías.
--
-- Sin esto, marcar quién llegó tarde serviría para corregir los minutos y para
-- nada más: el informe que se presenta diría «12 asistencias» juntando a los
-- que llegaron a la hora con los que entraron media hora después, que es
-- justamente la distinción que el profesor acaba de tomarse el trabajo de
-- anotar.
--
-- Solo se suman columnas: ningún número de los que ya había se calcula
-- distinto. Los minutos ya salían bien solos, porque el tramo de presencia
-- arranca cuando la persona llegó.
create or replace function public.reporte_actividades(p_desde date, p_hasta date)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
with rango as (
  select p_desde::timestamptz as ini, (p_hasta + 1)::timestamptz as fin
),
clases as (
  select cs.id, cs.title, cs.started_at, cs.ended_at, cs.notes, cs.summary, cs.created_by, cs.modalidad
  from public.class_sessions cs, rango r
  where cs.started_at >= r.ini and cs.started_at < r.fin
),
asistencia as (
  select ca.session_id, ca.student_id, ca.joined_at, ca.minutos_tarde
  from public.class_attendance ca
  join clases c on c.id = ca.session_id
),
-- Minutos dentro de clase, uniendo tramos superpuestos (minutos_por_tramos).
-- Los de una clase presencial son el tramo que declaró el profesor al pasar
-- lista, y entran por acá como cualquier otro: unidos, así que una presencial
-- que se solape con una en línea no se cuenta dos veces.
minutos as (
  select particion::uuid as student_id, minutos
  from public.minutos_por_tramos(
    (select array_agg(ROW(cpl.student_id::text, cpl.joined_at, cpl.left_at)::public.tramo_crudo)
     from public.class_presence_log cpl join clases c on c.id = cpl.session_id)
  )
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
  select c.id, c.title, c.started_at, c.ended_at, c.notes, c.summary, c.modalidad,
         prof.full_name as profesor,
         (select count(*) from asistencia a where a.session_id = c.id)::int as asistentes,
         (select count(*) from asistencia a where a.session_id = c.id and a.minutos_tarde > 0)::int as tardes,
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
         count(distinct a.session_id) filter (where c.modalidad = 'presencial')::int as clases_presenciales,
         count(distinct a.session_id) filter (where a.minutos_tarde > 0)::int as tardes,
         coalesce(sum(a.minutos_tarde), 0)::int as minutos_tarde,
         round(coalesce(m.minutos, 0))::int as minutos
  from asistencia a
  join clases c on c.id = a.session_id
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
    'clases_presenciales', (select count(*) from clases where modalidad = 'presencial'),
    'clases_en_linea', (select count(*) from clases where modalidad = 'en_linea'),
    'clases_cerradas', (select count(*) from clases where ended_at is not null),
    'estudiantes', (select count(distinct student_id) from asistencia),
    'asistencias', (select count(*) from asistencia),
    'tardes', (select count(*) from asistencia where minutos_tarde > 0),
    'minutos', (select round(coalesce(sum(minutos), 0))::int from minutos),
    'preguntas', (select count(*) from preguntas),
    'respuestas', (select coalesce(sum(respuestas), 0)::int from preguntas),
    'aciertos', (select coalesce(sum(aciertos), 0)::int from preguntas)
  ),
  'clases', coalesce((select jsonb_agg(to_jsonb(x) order by x.started_at) from por_clase x), '[]'::jsonb),
  'estudiantes', coalesce((select jsonb_agg(to_jsonb(y) order by y.full_name) from por_estudiante y), '[]'::jsonb),
  'preguntas', coalesce((select jsonb_agg(to_jsonb(z) order by z.created_at) from preguntas z), '[]'::jsonb)
);
$function$;