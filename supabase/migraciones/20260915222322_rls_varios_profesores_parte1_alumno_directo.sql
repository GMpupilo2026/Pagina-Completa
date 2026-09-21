-- Las políticas que decían "este alumno es mío" con
--   EXISTS (select 1 from profiles st where st.id = X and st.teacher_id = auth.uid())
-- ahora lo preguntan con soy_profesor_de(X), que mira profile_teachers. Es el
-- mismo permiso; lo único que cambia es que un alumno puede tener más de un
-- profesor y los dos pasan la prueba.

-- ------------------------------------------------------------ chat de clase
drop policy if exists class_chat_messages_select on public.class_chat_messages;
create policy class_chat_messages_select on public.class_chat_messages
  for select using (
    auth.uid() = student_id
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  );

drop policy if exists class_chat_messages_insert on public.class_chat_messages;
create policy class_chat_messages_insert on public.class_chat_messages
  for insert with check (
    auth.uid() = sender_id
    and (sender_id = student_id or public.soy_profesor_de(student_id))
  );

drop policy if exists class_chat_messages_delete on public.class_chat_messages;
create policy class_chat_messages_delete on public.class_chat_messages
  for delete using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  );

-- ------------------------------------------------------------ práctica
drop policy if exists practice_games_select on public.practice_games;
create policy practice_games_select on public.practice_games
  for select using (
    auth.uid() = student_id
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  );

drop policy if exists practice_games_update on public.practice_games;
create policy practice_games_update on public.practice_games
  for update using (
    auth.uid() = student_id
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  ) with check (
    auth.uid() = student_id
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  );

drop policy if exists practice_games_delete on public.practice_games;
create policy practice_games_delete on public.practice_games
  for delete using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  );

-- ------------------------------------------------------------ plan de entrenamiento
drop policy if exists training_plans_select_teacher on public.training_plans;
create policy training_plans_select_teacher on public.training_plans
  for select using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  );

drop policy if exists training_plans_insert_teacher on public.training_plans;
create policy training_plans_insert_teacher on public.training_plans
  for insert with check (
    teacher_id = auth.uid()
    and ((select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
         or public.soy_profesor_de(student_id))
  );

drop policy if exists training_plans_update_teacher on public.training_plans;
create policy training_plans_update_teacher on public.training_plans
  for update using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  ) with check (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  );

-- ------------------------------------------------------------ progreso y actividad
drop policy if exists training_progress_select_teacher on public.training_progress;
create policy training_progress_select_teacher on public.training_progress
  for select using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  );

drop policy if exists training_state_select_teacher on public.training_state;
create policy training_state_select_teacher on public.training_state
  for select using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  );

drop policy if exists platform_activity_log_select on public.platform_activity_log;
create policy platform_activity_log_select on public.platform_activity_log
  for select using (
    auth.uid() = student_id
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  );