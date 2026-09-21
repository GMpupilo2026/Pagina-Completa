-- Progreso de los ejercicios guardado en la cuenta del alumno, para que siga
-- donde lo dejó al cambiar de dispositivo. Cada fila es una clave de progreso
-- (las mismas que las páginas guardaban solo en localStorage) con su valor tal
-- cual, y la fecha en que se guardó.
create table if not exists public.training_state (
  student_id uuid not null references public.profiles(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (student_id, key)
);

comment on table public.training_state is
  'Progreso de ejercicios por usuario (js/progreso-usuario.js): espejo en la nube de las claves de progreso que las páginas de Entrenamiento guardan en localStorage, para continuar en otro dispositivo.';

alter table public.training_state enable row level security;

-- Cada quien manda sobre su propio progreso.
drop policy if exists training_state_select_own on public.training_state;
create policy training_state_select_own on public.training_state
  for select to authenticated using (student_id = auth.uid());

drop policy if exists training_state_insert_own on public.training_state;
create policy training_state_insert_own on public.training_state
  for insert to authenticated with check (student_id = auth.uid());

drop policy if exists training_state_update_own on public.training_state;
create policy training_state_update_own on public.training_state
  for update to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists training_state_delete_own on public.training_state;
create policy training_state_delete_own on public.training_state
  for delete to authenticated using (student_id = auth.uid());

-- Su profesor y quien administra pueden leerlo (para Informes), nunca escribirlo.
drop policy if exists training_state_select_teacher on public.training_state;
create policy training_state_select_teacher on public.training_state
  for select to authenticated
  using (
    (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or exists (select 1 from public.profiles st where st.id = training_state.student_id and st.teacher_id = auth.uid())
  );