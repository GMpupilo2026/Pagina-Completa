create table public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  variant text not null default 'crazyhouse' check (variant in ('crazyhouse')),
  white_id uuid not null references public.profiles(id) on delete cascade,
  black_id uuid not null references public.profiles(id) on delete cascade,
  fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1',
  moves jsonb not null default '[]'::jsonb,
  status text not null default 'playing' check (status in ('playing', 'finished')),
  result text check (result in ('white', 'black', 'draw')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint different_players check (white_id <> black_id)
);

comment on table public.game_rooms is 'Partidas de "Juegos" (variantes tipo Crazyhouse) que el profesor arma entre dos alumnos. El campo fen incluye la reserva de piezas capturadas entre corchetes, igual que la notación FEN de crazyhouse que usa lichess.';

alter table public.game_rooms enable row level security;

create policy game_rooms_select on public.game_rooms for select
  using (
    auth.uid() = white_id or auth.uid() = black_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

create policy game_rooms_insert_profesor on public.game_rooms for insert
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

create policy game_rooms_update on public.game_rooms for update
  using (
    auth.uid() = white_id or auth.uid() = black_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  )
  with check (
    auth.uid() = white_id or auth.uid() = black_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

create policy game_rooms_delete_profesor on public.game_rooms for delete
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

alter publication supabase_realtime add table public.game_rooms;
