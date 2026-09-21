create table public.fourplayer_games (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('ffa','teams')),
  seats jsonb not null, -- {red:{player_id,status,score,time_left}, blue:{...}, yellow:{...}, green:{...}}
  turn text not null default 'red' check (turn in ('red','blue','yellow','green')),
  board jsonb not null, -- estado serializado de FourPlayerChess.Game (js/fourplayer-engine.js .toJSON())
  moves jsonb not null default '[]'::jsonb,
  arrows jsonb not null default '{}'::jsonb, -- solo se usa en modo teams (flechas compartidas entre compañeros)
  status text not null default 'playing' check (status in ('playing','finished')),
  result jsonb, -- {winners:[...], reason:'checkmate'|'resign'|'draw'|'last-standing', bonusPoints:{...}}
  initial_seconds integer,
  increment_seconds integer default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fourplayer_games enable row level security;

-- Mismo modelo de confianza que game_rooms (Crazyhouse): los 4 participantes
-- y el profesor pueden leer/escribir; solo el profesor puede crear/borrar.
create policy fourplayer_games_select on public.fourplayer_games
  for select using (
    auth.uid()::text = any (array[
      seats->'red'->>'player_id', seats->'blue'->>'player_id',
      seats->'yellow'->>'player_id', seats->'green'->>'player_id'
    ])
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

create policy fourplayer_games_insert_profesor on public.fourplayer_games
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

create policy fourplayer_games_update on public.fourplayer_games
  for update using (
    auth.uid()::text = any (array[
      seats->'red'->>'player_id', seats->'blue'->>'player_id',
      seats->'yellow'->>'player_id', seats->'green'->>'player_id'
    ])
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  ) with check (
    auth.uid()::text = any (array[
      seats->'red'->>'player_id', seats->'blue'->>'player_id',
      seats->'yellow'->>'player_id', seats->'green'->>'player_id'
    ])
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

create policy fourplayer_games_delete_profesor on public.fourplayer_games
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

alter publication supabase_realtime add table public.fourplayer_games;
