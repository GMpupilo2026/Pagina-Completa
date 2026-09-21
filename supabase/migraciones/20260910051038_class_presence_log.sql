-- Registro de conexión real de cada alumno durante una clase (para "tiempo en clase" exacto
-- en Informes, en vez de estimarlo desde que entró hasta que el profesor cerró la clase).
-- Cada fila es una ventana de conexión; sesion.html la abre al entrar y la va "tocando"
-- (left_at) cada pocos segundos mientras la pestaña sigue abierta, así que left_at siempre
-- refleja de forma aproximada (con unos segundos de margen) el último momento conectado,
-- sin depender de que el navegador avise al cerrar la pestaña.
create table public.class_presence_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);
alter table public.class_presence_log enable row level security;

create policy "class_presence_log_select" on public.class_presence_log
  for select to authenticated
  using (
    auth.uid() = student_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

create policy "class_presence_log_insert_own" on public.class_presence_log
  for insert to authenticated
  with check (auth.uid() = student_id);

create policy "class_presence_log_update_own" on public.class_presence_log
  for update to authenticated
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);
