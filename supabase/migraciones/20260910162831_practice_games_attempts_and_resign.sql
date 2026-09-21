-- Permite que el alumno se rinda (nuevo estado "resigned") y reintente la misma ronda
-- (contador de intentos, para que el profesor vea cuántas veces jugó cada alumno).
alter table practice_games
  add column if not exists attempts integer not null default 1;

alter table practice_games
  drop constraint if exists practice_games_status_check;

alter table practice_games
  add constraint practice_games_status_check
  check (status = any (array['playing', 'checkmate_win', 'checkmate_loss', 'draw', 'resigned']));

comment on column practice_games.attempts is
  'Cuántas veces reinició el alumno esta ronda (rendirse/perder/tablas y volver a intentar la misma posición). Empieza en 1.';