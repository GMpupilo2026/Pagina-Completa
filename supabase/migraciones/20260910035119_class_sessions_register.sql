
-- Registro de clases: el profesor abre una clase (queda "en curso") y la cierra al
-- terminar, guardando información general (duración, cuántas partidas/preguntas hubo).
create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  title text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  summary jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.class_sessions enable row level security;

create policy "class_sessions_select_authenticated"
  on public.class_sessions for select to authenticated using (true);

create policy "class_sessions_insert_profesor"
  on public.class_sessions for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'));

create policy "class_sessions_update_profesor"
  on public.class_sessions for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'));

alter publication supabase_realtime add table public.class_sessions;
