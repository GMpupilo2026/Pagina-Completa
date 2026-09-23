-- La ficha presencial solo pasa lista a alumnos de quien la pasa.
-- Antes bastaba con ser el creador de una clase presencial: con eso se le
-- podía inventar asistencia y minutos a un alumno de OTRA profesora, y eso
-- llegaba a su informe y al correo de su casa sin que nada fallara.
drop policy if exists class_attendance_insert_profesor on public.class_attendance;
create policy class_attendance_insert_profesor on public.class_attendance
  for insert with check (
    exists (select 1 from public.class_sessions cs
            where cs.id = class_attendance.session_id and cs.created_by = auth.uid()
              and cs.modalidad = 'presencial')
    and (public.soy_profesor_de(student_id)
         or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id)))
  );

drop policy if exists class_attendance_update_profesor on public.class_attendance;
create policy class_attendance_update_profesor on public.class_attendance
  for update using (
    exists (select 1 from public.class_sessions cs
            where cs.id = class_attendance.session_id and cs.created_by = auth.uid()
              and cs.modalidad = 'presencial')
  ) with check (
    exists (select 1 from public.class_sessions cs
            where cs.id = class_attendance.session_id and cs.created_by = auth.uid()
              and cs.modalidad = 'presencial')
    and (public.soy_profesor_de(student_id)
         or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id)))
  );

drop policy if exists class_presence_log_insert_profesor on public.class_presence_log;
create policy class_presence_log_insert_profesor on public.class_presence_log
  for insert with check (
    exists (select 1 from public.class_sessions cs
            where cs.id = class_presence_log.session_id and cs.created_by = auth.uid()
              and cs.modalidad = 'presencial')
    and (public.soy_profesor_de(student_id)
         or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id)))
  );

-- Es la función del cron (corre como postgres): ninguna cuenta con sesión
-- tiene por qué dispararla, y hacerlo varias veces seguidas podía mandar dos
-- veces el mismo recordatorio. Igual que sus hermanas de informes y cobros.
revoke execute on function public.disparar_recordatorios_programados() from public, anon, authenticated;
