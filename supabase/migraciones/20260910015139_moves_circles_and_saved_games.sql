
-- Lista de jugadas (SAN) del juego en vivo actual, para poder deshacer con precisión
-- (reconstruyendo con chess.js en vez de depender solo del FEN, que no guarda historial).
alter table public.game_state
  add column moves jsonb not null default '[]'::jsonb,
  add column circles jsonb not null default '[]'::jsonb;

-- El tablero en vivo empieza limpio (todavía no hay ninguna clase real usándolo).
update public.game_state
  set fen = 'start', moves = '[]'::jsonb, arrows = '[]'::jsonb, circles = '[]'::jsonb, active_player_id = null
  where id = 1;

-- El trigger que protege columnas exclusivas del profesor también cubre `circles`.
create or replace function public.protect_game_state_teacher_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  is_teacher boolean;
begin
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
    into is_teacher;
  if not is_teacher then
    new.arrows := old.arrows;
    new.circles := old.circles;
    new.active_player_id := old.active_player_id;
  end if;
  return new;
end;
$$;

-- Partidas guardadas (PGN) para consultar/descargar después.
create table public.saved_games (
  id uuid primary key default gen_random_uuid(),
  pgn text not null,
  fen_final text not null,
  move_count int not null default 0,
  title text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.saved_games enable row level security;

create policy "saved_games_select_authenticated"
  on public.saved_games for select
  to authenticated
  using (true);

create policy "saved_games_insert_profesor"
  on public.saved_games for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

create policy "saved_games_delete_profesor"
  on public.saved_games for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

alter publication supabase_realtime add table public.saved_games;
