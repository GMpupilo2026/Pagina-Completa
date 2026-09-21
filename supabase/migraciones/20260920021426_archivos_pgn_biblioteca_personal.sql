-- Biblioteca personal de PGN por profesor ("Archivos", antes "Caja de Compartir").
-- Cada profesor sube sus propios PGN completos (partidas ya preparadas para dar
-- clase) y los puede "jalar" al tablero en vivo desde sesion.html. Mismo patrón
-- de aislamiento que saved_games: cada quien ve solo lo suyo, quien administra
-- ve todo.
create table public.archivos_pgn (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.profiles(id) on delete cascade,
  nombre_archivo text not null,
  titulo text not null,
  pgn text not null,
  move_count integer not null default 0,
  fen_final text not null,
  created_at timestamptz not null default now()
);

create index archivos_pgn_profesor_id_idx on public.archivos_pgn (profesor_id);

alter table public.archivos_pgn enable row level security;

create policy archivos_pgn_select on public.archivos_pgn
  for select
  using (
    (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or profesor_id = auth.uid()
  );

create policy archivos_pgn_insert on public.archivos_pgn
  for insert
  with check (
    (select my_profile.role from my_profile() my_profile(role, is_admin, teacher_id)) = 'profesor'
    and profesor_id = auth.uid()
  );

create policy archivos_pgn_delete on public.archivos_pgn
  for delete
  using (
    (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or profesor_id = auth.uid()
  );

alter publication supabase_realtime add table public.archivos_pgn;
