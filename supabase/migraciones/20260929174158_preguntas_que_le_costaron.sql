-- Lo que le costó a UN alumno: las preguntas de jugada de clase de los
-- últimos p_dias días que contestó mal, con la misma regla de fallo que el
-- repaso personal y que preguntas_que_costaron (marcada mal, o sin calificar
-- y distinta de la primera jugada del motor). Con `contestadas`, cuántas
-- contestó en total en ese tiempo (el mismo número en cada fila), para decir
-- «falló 6 de 14».
-- SECURITY INVOKER: la RLS decide. Su profe ve las de sus alumnos; el alumno,
-- las suyas; nadie más, nada.
create or replace function public.preguntas_que_le_costaron(p_alumno uuid, p_dias integer default 30)
returns table (question_id uuid, fen text, prompt text, created_at timestamptz,
               clase_titulo text, su_jugada text, jugada_buena text, contestadas integer)
language sql
stable
security invoker
set search_path = public
as $$
  with r as (
    select q.id, q.fen, q.prompt, q.created_at, q.class_session_id, a.moves->>0 as su_jugada, a.is_correct,
           (select e.answer->'moves'->>0 from public.question_engine_answers e
             where e.question_id = q.id order by e.computed_at limit 1) as clave
      from public.question_answers a
      join public.questions q on q.id = a.question_id
     where a.student_id = p_alumno
       and q.tipo is distinct from 'opciones'
       and q.fen is not null
       and q.closed_at is not null
       and q.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 180)))
  )
  select r.id, r.fen, r.prompt, r.created_at, cs.title, r.su_jugada, r.clave,
         (select count(*) from r)::int
    from r left join public.class_sessions cs on cs.id = r.class_session_id
   where r.is_correct is false
      or (r.is_correct is null and r.clave is not null and r.su_jugada is distinct from r.clave)
   order by r.created_at desc
   limit 12;
$$;
revoke execute on function public.preguntas_que_le_costaron(uuid, integer) from public, anon;
grant execute on function public.preguntas_que_le_costaron(uuid, integer) to authenticated;
