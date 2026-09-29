-- La pregunta de salida: la última de la clase, sobre lo visto. Su resultado
-- dice si el tema quedó o hay que repetirlo la próxima clase.
--
--  * questions.de_salida marca cuál es. Es una pregunta como cualquiera (el
--    termómetro «¿lo entendiste?» o «¿qué jugarías?» en el tablero): la
--    contestan igual y la base la califica igual.
--  * salida_de_la_clase(clase) la cuenta: la última de salida de esa clase,
--    cuántos respondieron de los que asistieron y cómo les fue. El veredicto
--    («quedó», «a medias», «repetirlo») lo dice la página con esos números.
--    SECURITY INVOKER: ve lo que la RLS ya le deja ver a quien pregunta.
alter table public.questions add column if not exists de_salida boolean not null default false;

create or replace function public.salida_de_la_clase(p_clase uuid)
returns table (
  question_id uuid, prompt text, tipo text,
  asistentes integer, respondieron integer,
  bien integer, medio integer, mal integer, sin_calificar integer
)
language sql
stable
security invoker
set search_path = public
as $$
with q as (
  select q.id, q.prompt, q.tipo
    from public.questions q
   where q.class_session_id = p_clase and q.de_salida
   order by q.created_at desc
   limit 1
),
a as (
  select a.* from public.question_answers a where a.question_id = (select id from q)
),
-- Una de opciones sin calificar (el termómetro) se cuenta por la opción
-- elegida: la primera es «bien», la segunda «a medias», el resto «mal». Con
-- clave, o de jugada, cuenta la calificación.
por_opcion as (
  select (select tipo from q) = 'opciones' and not exists (select 1 from a where a.is_correct is not null) as si
)
select q.id, q.prompt, q.tipo,
       (select count(*)::int from public.class_attendance ca where ca.session_id = p_clase
         and ca.student_id is distinct from (select cs.created_by from public.class_sessions cs where cs.id = p_clase)),
       (select count(*)::int from a),
       (select count(*)::int from a where case when (select si from por_opcion) then a.opcion = 0 else a.is_correct is true end),
       (select count(*)::int from a where (select si from por_opcion) and a.opcion = 1),
       (select count(*)::int from a where case when (select si from por_opcion) then a.opcion >= 2 else a.is_correct is false end),
       (select count(*)::int from a where not (select si from por_opcion) and a.is_correct is null)
  from q;
$$;
revoke execute on function public.salida_de_la_clase(uuid) from public, anon;
grant execute on function public.salida_de_la_clase(uuid) to authenticated;
