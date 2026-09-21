-- La otra forma que había que cambiar: "esto lo creó MI profesor", que se
-- escribía comparando contra my_profile().teacher_id — una sola columna. Ahora
-- se pregunta con es_mi_profesor(X), que acepta a cualquiera de los suyos.

-- Los asientos de una partida de 4 jugadores guardan el id como texto dentro de
-- un jsonb; si alguno viniera roto, vale NULL en vez de tumbar la consulta.
create or replace function public.uuid_seguro(p_texto text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return p_texto::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.jugadores_de_asientos(p_asientos jsonb)
returns uuid[] language sql immutable set search_path = '' as $$
  select array_remove(array[
    public.uuid_seguro(p_asientos->'red'->>'player_id'),
    public.uuid_seguro(p_asientos->'blue'->>'player_id'),
    public.uuid_seguro(p_asientos->'yellow'->>'player_id'),
    public.uuid_seguro(p_asientos->'green'->>'player_id')
  ], null);
$$;

revoke execute on function public.uuid_seguro(text) from public, anon;
revoke execute on function public.jugadores_de_asientos(jsonb) from public, anon;
grant execute on function public.uuid_seguro(text) to authenticated;
grant execute on function public.jugadores_de_asientos(jsonb) to authenticated;

-- ------------------------------------------------------------ clases y preguntas
drop policy if exists class_sessions_select on public.class_sessions;
create policy class_sessions_select on public.class_sessions
  for select using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or created_by = auth.uid()
    or public.es_mi_profesor(created_by)
  );

drop policy if exists practice_sessions_select on public.practice_sessions;
create policy practice_sessions_select on public.practice_sessions
  for select using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or created_by = auth.uid()
    or public.es_mi_profesor(created_by)
  );

drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions
  for select using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or created_by = auth.uid()
    or public.es_mi_profesor(created_by)
  );

drop policy if exists game_state_select on public.game_state;
create policy game_state_select on public.game_state
  for select using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or owner_id = auth.uid()
    or public.es_mi_profesor(owner_id)
  );

drop policy if exists variant_nodes_select on public.variant_nodes;
create policy variant_nodes_select on public.variant_nodes
  for select using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or teacher_id = auth.uid()
    or public.es_mi_profesor(teacher_id)
  );

drop policy if exists class_attendance_insert_own on public.class_attendance;
create policy class_attendance_insert_own on public.class_attendance
  for insert with check (
    auth.uid() = student_id
    and exists (select 1 from public.class_sessions cs
                where cs.id = session_id and public.es_mi_profesor(cs.created_by))
  );

drop policy if exists class_presence_log_insert_own on public.class_presence_log;
create policy class_presence_log_insert_own on public.class_presence_log
  for insert with check (
    auth.uid() = student_id
    and exists (select 1 from public.class_sessions cs
                where cs.id = session_id and public.es_mi_profesor(cs.created_by))
  );

drop policy if exists question_answers_insert_own on public.question_answers;
create policy question_answers_insert_own on public.question_answers
  for insert with check (
    auth.uid() = student_id
    and exists (select 1 from public.questions q
                where q.id = question_id and public.es_mi_profesor(q.created_by))
  );

drop policy if exists question_answers_select on public.question_answers;
create policy question_answers_select on public.question_answers
  for select using (
    auth.uid() = student_id
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or exists (select 1 from public.questions q
               where q.id = question_id
                 and (q.created_by = auth.uid() or public.es_mi_profesor(q.created_by)))
  );