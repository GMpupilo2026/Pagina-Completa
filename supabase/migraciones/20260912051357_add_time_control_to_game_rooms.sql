-- Reloj de la partida (opcional): null en initial_seconds = "sin límite", igual que
-- siempre se jugó hasta ahora. Cuando sí hay tiempo, white_time_left/black_time_left
-- guardan los segundos que le quedaban a cada quien la última vez que se "congeló" su
-- reloj (al crear la partida, o justo después de cada jugada), y clock_updated_at
-- marca desde cuándo corre el reloj de quien tiene el turno ahora — el tiempo real que
-- le queda a quien está pensando se calcula en el navegador restando el tiempo
-- transcurrido desde ese instante, no hace falta ir escribiendo la base de datos cada
-- segundo.
alter table public.game_rooms
  add column initial_seconds integer,
  add column increment_seconds integer not null default 0,
  add column white_time_left numeric,
  add column black_time_left numeric,
  add column clock_updated_at timestamptz;

alter table public.game_rooms
  add constraint game_rooms_initial_seconds_check check (initial_seconds is null or initial_seconds > 0),
  add constraint game_rooms_increment_seconds_check check (increment_seconds >= 0);

comment on column public.game_rooms.initial_seconds is 'Minutos*60 iniciales para cada jugador. NULL = partida sin límite de tiempo (como siempre se jugó).';
comment on column public.game_rooms.increment_seconds is 'Segundos que se suman al reloj de quien mueve, después de cada jugada (incremento tipo Fischer). 0 = sin incremento.';
comment on column public.game_rooms.white_time_left is 'Segundos que le quedaban a blancas la última vez que se congeló su reloj (creación de la partida o última jugada de blancas). NULL si la partida no tiene reloj.';
comment on column public.game_rooms.black_time_left is 'Igual que white_time_left, para negras.';
comment on column public.game_rooms.clock_updated_at is 'Desde cuándo corre el reloj de quien tiene el turno ahora — el navegador calcula el tiempo restante real restando (now() - clock_updated_at) del *_time_left del color en turno.';
