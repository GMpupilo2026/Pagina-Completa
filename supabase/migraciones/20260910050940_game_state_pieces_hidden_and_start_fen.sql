-- Ocultar piezas a los alumnos, y permitir una posición inicial distinta a la estándar
-- (usada por el modo edición libre / jugadas ilegales del profesor).
alter table public.game_state add column pieces_hidden boolean not null default false;
alter table public.game_state add column start_fen text;
