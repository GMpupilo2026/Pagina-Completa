
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
       coalesce(mc.minutos, 0)::double precision, coalesce(me.minutos, 0)::double precision,
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
