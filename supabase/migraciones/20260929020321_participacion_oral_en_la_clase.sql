-- La participación oral en la clase: cada turno (al azar o por mano
-- levantada) queda con cómo respondió.
--
--  * clase_elegidos.origen: 'azar' (el sorteo) o 'mano' (el profe le dio la
--    palabra a quien levantó la mano).
--  * clase_elegidos.resultado: 'bien' o 'casi', o null si el profe terminó el
--    turno sin anotar. Lo anota el profe; el alumno solo lee lo suyo.
--  * resumen_de_la_clase cuenta los turnos de cada uno y cómo le fue.
alter table public.clase_elegidos add column if not exists origen text not null default 'azar';
alter table public.clase_elegidos add column if not exists resultado text;
alter table public.clase_elegidos drop constraint if exists clase_elegidos_origen_check;
alter table public.clase_elegidos add constraint clase_elegidos_origen_check check (origen in ('azar', 'mano'));
alter table public.clase_elegidos drop constraint if exists clase_elegidos_resultado_check;
alter table public.clase_elegidos add constraint clase_elegidos_resultado_check check (resultado is null or resultado in ('bien', 'casi'));

-- Anotar cómo respondió: solo quien dio la clase.
drop policy if exists clase_elegidos_update on public.clase_elegidos;
create policy clase_elegidos_update on public.clase_elegidos for update to authenticated
  using (exists (select 1 from public.class_sessions cs
                  where cs.id = class_session_id and cs.created_by = (select auth.uid())))
  with check (exists (select 1 from public.class_sessions cs
                       where cs.id = class_session_id and cs.created_by = (select auth.uid())));

-- El alumno lee sus propios turnos («Tu última clase»); los de los demás, no.
drop policy if exists clase_elegidos_select_propio on public.clase_elegidos;
create policy clase_elegidos_select_propio on public.clase_elegidos for select to authenticated
  using (student_id = (select auth.uid()));

-- Cambia lo que devuelve: hay que borrarla y volver a crearla.
drop function if exists public.resumen_de_la_clase(uuid);
create function public.resumen_de_la_clase(p_clase uuid)
returns table (
  student_id uuid, nombre text,
  preguntas integer, respondidas integer, correctas integer, incorrectas integer, sin_calificar integer,
  practicas integer, ganadas integer, tablas integer, perdidas integer,
  partidas integer, partidas_ganadas integer, partidas_tablas integer, partidas_perdidas integer,
  turnos integer, turnos_bien integer, turnos_casi integer
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
         count(*) filter (where g.status in ('checkmate_loss', 'resigned', 'timeout'))::int as perdidas
    from public.practice_games g
   where g.session_id in (select id from ps)
   group by g.student_id
),
-- Cada partida entre alumnos cuenta para los dos, desde su lado.
lados as (
  select r.white_id as student_id, r.status, case r.result when 'white' then 'g' when 'black' then 'p' when 'draw' then 't' end as res
    from public.game_rooms r where r.class_session_id = p_clase
  union all
  select r.black_id, r.status, case r.result when 'black' then 'g' when 'white' then 'p' when 'draw' then 't' end
    from public.game_rooms r where r.class_session_id = p_clase
),
part as (
  select l.student_id,
         count(*)::int as partidas,
         count(*) filter (where l.res = 'g')::int as partidas_ganadas,
         count(*) filter (where l.res = 't')::int as partidas_tablas,
         count(*) filter (where l.res = 'p')::int as partidas_perdidas
    from lados l
   where l.student_id is not null
   group by l.student_id
),
-- La participación oral: los turnos al azar y por mano levantada.
turn as (
  select e.student_id,
         count(*)::int as turnos,
         count(*) filter (where e.resultado = 'bien')::int as turnos_bien,
         count(*) filter (where e.resultado = 'casi')::int as turnos_casi
    from public.clase_elegidos e
   where e.class_session_id = p_clase
   group by e.student_id
),
gente as (
  select ca.student_id from public.class_attendance ca where ca.session_id = p_clase
  union select student_id from resp
  union select student_id from prac
  union select student_id from part
  union select student_id from turn
)
select g.student_id,
       coalesce(nullif(p.full_name, ''), p.email, 'Alumno'),
       (select count(*)::int from pq),
       coalesce(r.respondidas, 0), coalesce(r.correctas, 0), coalesce(r.incorrectas, 0), coalesce(r.sin_calificar, 0),
       coalesce(x.practicas, 0), coalesce(x.ganadas, 0), coalesce(x.tablas, 0), coalesce(x.perdidas, 0),
       coalesce(y.partidas, 0), coalesce(y.partidas_ganadas, 0), coalesce(y.partidas_tablas, 0), coalesce(y.partidas_perdidas, 0),
       coalesce(t.turnos, 0), coalesce(t.turnos_bien, 0), coalesce(t.turnos_casi, 0)
  from gente g
  left join public.profiles p on p.id = g.student_id
  left join resp r on r.student_id = g.student_id
  left join prac x on x.student_id = g.student_id
  left join part y on y.student_id = g.student_id
  left join turn t on t.student_id = g.student_id
 -- Quien juega contra su profe también aparece en game_rooms: el profe no es
 -- un alumno de su propia clase.
 where g.student_id is distinct from (select cs.created_by from public.class_sessions cs where cs.id = p_clase)
 order by 2;
$$;
revoke execute on function public.resumen_de_la_clase(uuid) from public, anon;
grant execute on function public.resumen_de_la_clase(uuid) to authenticated;