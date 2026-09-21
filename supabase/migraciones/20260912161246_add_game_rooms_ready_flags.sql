alter table public.game_rooms
  add column white_ready boolean not null default false,
  add column black_ready boolean not null default false;