alter table public.game_state
  add column if not exists active_player_color text not null default 'both'
  check (active_player_color in ('w', 'b', 'both'));

comment on column public.game_state.active_player_color is
  'Con qué color puede mover el active_player_id: w, b, o both. Solo importa mientras active_player_id no sea null (el profesor siempre puede mover cualquier color).';
