-- Asistencia: un registro por alumno y clase, para "asistencia" y "tiempo en clase" en Informes.
create table public.class_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (session_id, student_id)
);
alter table public.class_attendance enable row level security;

create policy "class_attendance_select" on public.class_attendance
  for select to authenticated
  using (
    auth.uid() = student_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

create policy "class_attendance_insert_own" on public.class_attendance
  for insert to authenticated
  with check (auth.uid() = student_id);

alter publication supabase_realtime add table public.class_attendance;

-- Permitir al profesor eliminar clases del registro (antes no había política de DELETE).
create policy "class_sessions_delete_profesor" on public.class_sessions
  for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'));
