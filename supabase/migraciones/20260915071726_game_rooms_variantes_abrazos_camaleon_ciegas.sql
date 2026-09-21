-- Tres modalidades nuevas de Juegos (variante.html): Ajedrez de abrazos, Camaleón y
-- A ciegas. variant_state guarda lo que no cabe en el FEN (por ahora, los
-- desbloqueos de planilla que le quedan a cada color en A ciegas).
alter table public.game_rooms drop constraint if exists game_rooms_variant_check;
alter table public.game_rooms add constraint game_rooms_variant_check
  check (variant = any (array['crazyhouse','cartas','duelo','niebla','estandar','abrazos','camaleon','ciegas']::text[]));
alter table public.game_rooms add column if not exists variant_state jsonb;
comment on column public.game_rooms.variant_state is 'Estado extra de la variante (A ciegas: {w_unlocks, b_unlocks}).';