-- El profesor elige cuántas partidas del torneo se muestran en vivo en la página TV
-- (1 a 10). Cada una ocupa 1/N del ancho disponible.
alter table tv_settings
  add column if not exists games_count integer not null default 1;

alter table tv_settings
  drop constraint if exists tv_settings_games_count_check;

alter table tv_settings
  add constraint tv_settings_games_count_check check (games_count between 1 and 10);