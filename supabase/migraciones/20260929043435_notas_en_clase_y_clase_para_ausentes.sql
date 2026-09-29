-- Notas rápidas en la clase, y la clase como lección para quien faltó.
--
--  * notas_alumno.class_session_id y .fen: una nota de la bitácora puede
--    quedar ligada a la clase donde se escribió y llevar la posición del
--    tablero («acá se equivocó»). La clase tiene que ser del mismo profe que
--    firma la nota: lo revisa un trigger, no la pantalla.
--  * class_sessions.para_ausentes: el profe decide al cerrar que la partida de
--    la clase la puedan repasar también sus alumnos que no vinieron. Sin
--    marcarla, sigue como antes: solo quien asistió
--    (saved_games_select_asistentes).
--  * question_engine_answers: la respuesta del motor de una pregunta YA
--    CERRADA la puede leer un alumno de quien la hizo, para repasarla después.
--    Mientras la pregunta está abierta, no: sería la respuesta servida.
alter table public.notas_alumno add column if not exists class_session_id uuid references public.class_sessions(id) on delete set null;
alter table public.notas_alumno add column if not exists fen text;
alter table public.notas_alumno drop constraint if exists notas_alumno_fen_forma;
alter table public.notas_alumno add constraint notas_alumno_fen_forma
  check (fen is null or char_length(fen) between 15 and 100);

create or replace function public.notas_alumno_clase_propia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.class_session_id is not null and not exists (
       select 1 from public.class_sessions cs
        where cs.id = new.class_session_id and cs.created_by = new.profesor_id) then
    raise exception 'Esa clase no es tuya.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.notas_alumno_clase_propia() from public, anon, authenticated;
drop trigger if exists notas_alumno_clase_propia on public.notas_alumno;
create trigger notas_alumno_clase_propia before insert or update on public.notas_alumno
  for each row execute function public.notas_alumno_clase_propia();

alter table public.class_sessions add column if not exists para_ausentes boolean not null default false;

drop policy if exists saved_games_select_ausentes on public.saved_games;
create policy saved_games_select_ausentes on public.saved_games for select to authenticated
  using (class_session_id in (
    select cs.id from public.class_sessions cs
     where cs.para_ausentes
       and cs.created_by in (select interno.profesores_de((select auth.uid())))));

drop policy if exists question_engine_answers_select_alumno on public.question_engine_answers;
create policy question_engine_answers_select_alumno on public.question_engine_answers for select to authenticated
  using (question_id in (
    select q.id from public.questions q
     where q.closed_at is not null
       and q.created_by in (select interno.profesores_de((select auth.uid())))));
