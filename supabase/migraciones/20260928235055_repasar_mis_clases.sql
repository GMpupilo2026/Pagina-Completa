-- Repasar mis clases: la partida que se guarda en una clase queda LIGADA a
-- esa clase y la pueden recorrer, jugada por jugada, los alumnos que fueron.
--
-- Antes «💾 Guardar PGN» dejaba la partida solo para quien la guardó
-- (saved_games_select: created_by = auth.uid()), y el alumno que quería
-- repasar lo que vio no tenía cómo. Ahora:
--
--  * class_session_id: la clase en que se guardó. La pone la base con el
--    mismo trigger que las preguntas, las prácticas y las partidas de la
--    clase (ligar_a_la_clase_abierta): la clase abierta de quien la guarda.
--    Guardada fuera de clase queda en NULL y sigue siendo solo del profe.
--  * datos: la clase en crudo (arranque, jugadas, variantes y comentarios),
--    la forma que recibe js/pgn-clase.js. El PGN se sigue guardando para
--    descargarlo; el visor (repasar-clases.html) lee `datos`.
--  * La ve quien ASISTIÓ a esa clase (class_attendance) y nadie más: un
--    compañero que no fue no la recibe, ni otra academia. Y, como el resto de
--    lo de la clase, solo con el acceso vigente (acceso_vigente(), que al
--    equipo docente siempre le da true).
--  * Solo se liga a una clase PROPIA: el insert no deja colgar una partida
--    de la clase de otro profe.
alter table public.saved_games
  add column if not exists class_session_id uuid references public.class_sessions(id) on delete set null,
  add column if not exists datos jsonb;
alter table public.saved_games drop constraint if exists saved_games_datos_forma;
alter table public.saved_games add constraint saved_games_datos_forma
  check (datos is null or (jsonb_typeof(datos) = 'object' and pg_column_size(datos) <= 262144));
create index if not exists saved_games_class_session_idx on public.saved_games (class_session_id);

drop trigger if exists saved_games_ligar_a_la_clase on public.saved_games;
create trigger saved_games_ligar_a_la_clase before insert on public.saved_games
  for each row execute function public.ligar_a_la_clase_abierta();

drop policy if exists saved_games_insert on public.saved_games;
create policy saved_games_insert on public.saved_games for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select (mp.is_admin or mp.role = 'profesor') from public.my_profile() mp(role, is_admin, teacher_id))
    and (class_session_id is null or exists (
      select 1 from public.class_sessions cs
       where cs.id = class_session_id and cs.created_by = (select auth.uid()))));

drop policy if exists saved_games_select_asistentes on public.saved_games;
create policy saved_games_select_asistentes on public.saved_games for select to authenticated
  using (class_session_id in (
    select ca.session_id from public.class_attendance ca where ca.student_id = (select auth.uid())));

drop policy if exists saved_games_exige_acceso_sel on public.saved_games;
create policy saved_games_exige_acceso_sel on public.saved_games as restrictive for select to authenticated
  using ((select public.acceso_vigente()));
