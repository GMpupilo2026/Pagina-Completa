-- Plan de entrenamiento que el profesor (o un administrador) arma a partir del
-- diagnóstico de un alumno y que puede compartir con él.
create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.profiles(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  plan jsonb not null default '{}'::jsonb,
  nota text,
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.training_plans is
  'Plan de entrenamiento por alumno, generado desde su diagnóstico (entreno/diagnostico.html) y editable por el profesor en Informes. Solo lo ve el alumno cuando shared = true.';

alter table public.training_plans enable row level security;

-- El alumno ve su plan solo si el profesor se lo compartió.
drop policy if exists training_plans_select_student on public.training_plans;
create policy training_plans_select_student on public.training_plans
  for select to authenticated
  using (student_id = auth.uid() and shared = true);

-- El profesor del alumno y los administradores lo ven siempre.
drop policy if exists training_plans_select_teacher on public.training_plans;
create policy training_plans_select_teacher on public.training_plans
  for select to authenticated
  using (
    (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or exists (select 1 from public.profiles st where st.id = training_plans.student_id and st.teacher_id = auth.uid())
  );

-- Solo el profesor del alumno (o un administrador) crea y edita el plan.
drop policy if exists training_plans_insert_teacher on public.training_plans;
create policy training_plans_insert_teacher on public.training_plans
  for insert to authenticated
  with check (
    teacher_id = auth.uid() and (
      (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
      or exists (select 1 from public.profiles st where st.id = training_plans.student_id and st.teacher_id = auth.uid())
    )
  );

drop policy if exists training_plans_update_teacher on public.training_plans;
create policy training_plans_update_teacher on public.training_plans
  for update to authenticated
  using (
    (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or exists (select 1 from public.profiles st where st.id = training_plans.student_id and st.teacher_id = auth.uid())
  )
  with check (
    (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or exists (select 1 from public.profiles st where st.id = training_plans.student_id and st.teacher_id = auth.uid())
  );

create index if not exists training_plans_student_idx on public.training_plans (student_id);