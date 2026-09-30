-- La práctica contra el motor con reloj, y las partidas entre alumnos de la
-- clase en vivo.
--
--  * practice_sessions.reloj_segundos / incremento_segundos: el tiempo del
--    alumno en la práctica (null = sin reloj). Es entrenamiento contra una
--    máquina, no una partida puntuable: el reloj lo lleva el navegador del
--    alumno y guarda lo que le queda en practice_games.reloj_ms. Quedarse sin
--    tiempo es un resultado más, 'timeout'.
--  * game_rooms.class_session_id: las partidas entre alumnos que el profe
--    arma desde la clase quedan ligadas a ella, con el mismo trigger que las
--    preguntas y las prácticas (ligar_a_la_clase_abierta). El reloj de esas
--    partidas sí es el de siempre, el que valida el servidor.
--  * resumen_de_la_clase cuenta también esas partidas y las derrotas por
--    tiempo de la práctica.
alter table public.practice_sessions add column if not exists reloj_segundos integer;
alter table public.practice_sessions add column if not exists incremento_segundos integer not null default 0;
alter table public.practice_sessions drop constraint if exists practice_sessions_reloj_rango;
alter table public.practice_sessions add constraint practice_sessions_reloj_rango check (
  (reloj_segundos is null or reloj_segundos between 30 and 3600) and incremento_segundos between 0 and 60);

alter table public.practice_games add column if not exists reloj_ms integer;
alter table public.practice_games drop constraint if exists practice_games_status_check;
alter table public.practice_games add constraint practice_games_status_check
  check (status = any (array['playing', 'checkmate_win', 'checkmate_loss', 'draw', 'resigned', 'timeout']));

alter table public.game_rooms add column if not exists class_session_id uuid
  references public.class_sessions(id) on delete set null;
create index if not exists game_rooms_class_session_idx on public.game_rooms (class_session_id) where class_session_id is not null;
drop trigger if exists game_rooms_ligar_a_la_clase on public.game_rooms;
create trigger game_rooms_ligar_a_la_clase before insert on public.game_rooms
  for each row execute function public.ligar_a_la_clase_abierta();

-- Cambia lo que devuelve: hay que borrarla y volver a crearla.
drop function if exists public.resumen_de_la_clase(uuid);
create function public.resumen_de_la_clase(p_clase uuid)
returns table (
  student_id uuid, nombre text,
  preguntas integer, respondidas integer, correctas integer, incorrectas integer, sin_calificar integer,
  practicas integer, ganadas integer, tablas integer, perdidas integer,
  partidas integer, partidas_ganadas integer, partidas_tablas integer, partidas_perdidas integer
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
gente as (
  select ca.student_id from public.class_attendance ca where ca.session_id = p_clase
  union select student_id from resp
  union select student_id from prac
  union select student_id from part
)
select g.student_id,
       coalesce(nullif(p.full_name, ''), p.email, 'Alumno'),
       (select count(*)::int from pq),
       coalesce(r.respondidas, 0), coalesce(r.correctas, 0), coalesce(r.incorrectas, 0), coalesce(r.sin_calificar, 0),
       coalesce(x.practicas, 0), coalesce(x.ganadas, 0), coalesce(x.tablas, 0), coalesce(x.perdidas, 0),
       coalesce(y.partidas, 0), coalesce(y.partidas_ganadas, 0), coalesce(y.partidas_tablas, 0), coalesce(y.partidas_perdidas, 0)
  from gente g
  left join public.profiles p on p.id = g.student_id
  left join resp r on r.student_id = g.student_id
  left join prac x on x.student_id = g.student_id
  left join part y on y.student_id = g.student_id
 -- Quien juega contra su profe también aparece en game_rooms: el profe no es
 -- un alumno de su propia clase.
 where g.student_id is distinct from (select cs.created_by from public.class_sessions cs where cs.id = p_clase)
 order by 2;
$$;
revoke execute on function public.resumen_de_la_clase(uuid) from public, anon;
grant execute on function public.resumen_de_la_clase(uuid) to authenticated;