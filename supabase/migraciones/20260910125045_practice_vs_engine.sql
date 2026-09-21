-- Práctica contra el motor: el profesor lanza una ronda desde la posición actual del
-- tablero y cada alumno juega su propia partida contra Stockfish, a un nivel elegido
-- por el profesor. El profesor ve todas las partidas de los alumnos en vivo.

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  fen text not null,
  level text not null check (level = any (array['1500', '1800', 'max'])),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.practice_games (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  student_color text not null check (student_color = any (array['w', 'b'])),
  fen text not null,
  moves jsonb not null default '[]'::jsonb,
  status text not null default 'playing'
    check (status = any (array['playing', 'checkmate_win', 'checkmate_loss', 'draw'])),
  eval_cp integer,
  eval_mate integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create index practice_games_session_id_idx on public.practice_games (session_id);

alter table public.practice_sessions enable row level security;
alter table public.practice_games enable row level security;

-- practice_sessions: cualquier autenticado ve la ronda activa (para saber que empezó);
-- solo el profesor la crea o la cierra (ended_at).
create policy practice_sessions_select_authenticated
  on public.practice_sessions for select
  using (true);

create policy practice_sessions_insert_profesor
  on public.practice_sessions for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'));

create policy practice_sessions_update_profesor
  on public.practice_sessions for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'));

-- practice_games: cada alumno crea/actualiza SOLO su propia partida; el profesor puede
-- ver todas (para el panel de tableros en vivo) y también actualizar/borrar si hace falta
-- limpiar una partida trabada.
create policy practice_games_select
  on public.practice_games for select
  using (
    auth.uid() = student_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

create policy practice_games_insert_own
  on public.practice_games for insert
  with check (auth.uid() = student_id);

create policy practice_games_update
  on public.practice_games for update
  using (
    auth.uid() = student_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  )
  with check (
    auth.uid() = student_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

create policy practice_games_delete_profesor
  on public.practice_games for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'));

alter publication supabase_realtime add table public.practice_sessions;
alter publication supabase_realtime add table public.practice_games;
