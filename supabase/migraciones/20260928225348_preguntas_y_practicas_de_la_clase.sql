-- Las preguntas («¿Qué jugarías?») y las prácticas contra el motor quedan
-- ligadas a la clase en la que se hicieron. Antes no tenían clase: lo que
-- contestó cada alumno no se podía decir al cerrar, ni en el registro, ni en
-- el informe, aunque estuviera guardado.
--
-- La liga la pone un trigger y no la página: en sesion.js hay cinco lugares
-- que crean una pregunta y cuatro que abren una práctica, y el que se olvidara
-- de mandarla dejaría esa pregunta fuera de la clase sin dar ningún error.
alter table public.questions add column if not exists class_session_id uuid
  references public.class_sessions(id) on delete set null;
alter table public.practice_sessions add column if not exists class_session_id uuid
  references public.class_sessions(id) on delete set null;
create index if not exists questions_class_session_idx on public.questions (class_session_id) where class_session_id is not null;
create index if not exists practice_sessions_class_session_idx on public.practice_sessions (class_session_id) where class_session_id is not null;

-- La clase abierta de quien crea la fila (a lo sumo una: la garantiza el
-- índice class_sessions_una_abierta_por_profesor). Sin clase abierta queda
-- null: una pregunta de preparación no es de ninguna clase.
create or replace function public.ligar_a_la_clase_abierta()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.class_session_id is null then
    select cs.id into new.class_session_id
      from public.class_sessions cs
     where cs.created_by = new.created_by and cs.ended_at is null
     order by cs.started_at desc
     limit 1;
  end if;
  return new;
end;
$$;
revoke execute on function public.ligar_a_la_clase_abierta() from public, anon, authenticated;

drop trigger if exists questions_ligar_a_la_clase on public.questions;
create trigger questions_ligar_a_la_clase before insert on public.questions
  for each row execute function public.ligar_a_la_clase_abierta();
drop trigger if exists practice_sessions_ligar_a_la_clase on public.practice_sessions;
create trigger practice_sessions_ligar_a_la_clase before insert on public.practice_sessions
  for each row execute function public.ligar_a_la_clase_abierta();

-- Lo que hizo cada alumno en UNA clase: cuántas preguntas se hicieron, cuántas
-- contestó y cómo se calificaron, y cómo le fue en las prácticas contra el
-- motor. Entran los que asistieron y también los que contestaron sin quedar
-- en la asistencia (entraron por otra pestaña): nadie que hizo algo se pierde.
--
-- SECURITY INVOKER: la RLS decide. El profesor ve lo de su clase; un alumno
-- recibe solo su fila; preguntar por una clase ajena da cero filas. La cuenta
-- va en la base: una academia grande pasa de mil respuestas en un mes.
create or replace function public.resumen_de_la_clase(p_clase uuid)
returns table (
  student_id uuid, nombre text,
  preguntas integer, respondidas integer, correctas integer, incorrectas integer, sin_calificar integer,
  practicas integer, ganadas integer, tablas integer, perdidas integer
)
language sql
stable
security invoker
set search_path = public
as $$
with pq as (
  select q.id from public.questions q where q.class_session_id = p_clase
),
ps as (
  select s.id from public.practice_sessions s where s.class_session_id = p_clase
),
resp as (
  select a.student_id,
         count(*)::int as respondidas,
         count(*) filter (where a.is_correct is true)::int as correctas,
         count(*) filter (where a.is_correct is false)::int as incorrectas,
         count(*) filter (where a.is_correct is null)::int as sin_calificar
    from public.question_answers a
   where a.question_id in (select id from pq)
   group by a.student_id
),
prac as (
  select g.student_id,
         count(*)::int as practicas,
         count(*) filter (where g.status = 'checkmate_win')::int as ganadas,
         count(*) filter (where g.status = 'draw')::int as tablas,
         count(*) filter (where g.status in ('checkmate_loss', 'resigned'))::int as perdidas
    from public.practice_games g
   where g.session_id in (select id from ps)
   group by g.student_id
),
gente as (
  select ca.student_id from public.class_attendance ca where ca.session_id = p_clase
  union select student_id from resp
  union select student_id from prac
)
select g.student_id,
       coalesce(nullif(p.full_name, ''), p.email, 'Alumno'),
       (select count(*)::int from pq),
       coalesce(r.respondidas, 0), coalesce(r.correctas, 0), coalesce(r.incorrectas, 0), coalesce(r.sin_calificar, 0),
       coalesce(x.practicas, 0), coalesce(x.ganadas, 0), coalesce(x.tablas, 0), coalesce(x.perdidas, 0)
  from gente g
  left join public.profiles p on p.id = g.student_id
  left join resp r on r.student_id = g.student_id
  left join prac x on x.student_id = g.student_id
 order by 2;
$$;
revoke execute on function public.resumen_de_la_clase(uuid) from public, anon;
grant execute on function public.resumen_de_la_clase(uuid) to authenticated;