-- Lo que más le costó al grupo: las preguntas de jugada del profe en los
-- últimos p_dias días que más falló su clase, para repetirlas. Una respuesta
-- es un fallo con la misma regla que el repaso personal (js/repaso-clase.js):
-- marcada mal, o sin calificar y distinta de la primera jugada del motor.
-- Solo las de quien pregunta (created_by = auth.uid()), ya cerradas y con al
-- menos dos respuestas: con una sola, el porcentaje no dice nada del grupo.
-- SECURITY INVOKER: las respuestas las ve por su RLS de siempre.
create or replace function public.preguntas_que_costaron(p_dias integer default 30)
returns table (question_id uuid, fen text, prompt text, created_at timestamptz,
               clase_titulo text, respondieron integer, fallaron integer)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select q.id, q.fen, q.prompt, q.created_at, q.class_session_id,
           (select e.answer->'moves'->>0 from public.question_engine_answers e
             where e.question_id = q.id order by e.computed_at limit 1) as clave
      from public.questions q
     where q.created_by = (select auth.uid())
       and q.tipo is distinct from 'opciones'
       and q.fen is not null
       and q.closed_at is not null
       and q.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 180)))
  ), c as (
    select q.id, q.fen, q.prompt, q.created_at, q.class_session_id,
           count(*)::int as respondieron,
           count(*) filter (where a.is_correct is false
                               or (a.is_correct is null and q.clave is not null
                                   and a.moves->>0 is distinct from q.clave))::int as fallaron
      from q join public.question_answers a on a.question_id = q.id
     group by q.id, q.fen, q.prompt, q.created_at, q.class_session_id
    having count(*) >= 2
  )
  select c.id, c.fen, c.prompt, c.created_at, cs.title, c.respondieron, c.fallaron
    from c left join public.class_sessions cs on cs.id = c.class_session_id
   where c.fallaron > 0
   order by c.fallaron::numeric / c.respondieron desc, c.fallaron desc, c.created_at desc
   limit 10;
$$;
revoke execute on function public.preguntas_que_costaron(integer) from public, anon;
grant execute on function public.preguntas_que_costaron(integer) to authenticated;
