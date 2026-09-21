-- Registro (append-only) de avances en Entrenamiento (4x4, Aprender, Coordenadas
-- y lo que se vaya agregando). "detail" es jsonb a propósito: cada actividad
-- guarda ahí lo que le sirva sin tener que migrar el esquema cada vez que se
-- agregue una sección nueva a Entrenamiento.
create table public.training_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  activity text not null check (activity in ('4x4', 'aprender', 'coordenadas')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index training_progress_student_idx on public.training_progress (student_id, activity, created_at desc);

alter table public.training_progress enable row level security;

-- Cada alumno solo puede insertar y leer sus propias filas — y no puede
-- editarlas ni borrarlas (es un historial, no debe poder maquillarse).
create policy "training_progress_insert_own" on public.training_progress
  for insert to authenticated
  with check (student_id = auth.uid());

create policy "training_progress_select_own" on public.training_progress
  for select to authenticated
  using (student_id = auth.uid());

-- El profesor y quien administra ven el progreso de todos, para Informes.
create policy "training_progress_select_teacher" on public.training_progress
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.role = 'profesor' or p.is_admin)
    )
  );
