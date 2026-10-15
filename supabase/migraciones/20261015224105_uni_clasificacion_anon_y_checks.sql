-- Como uni_torneos: anon no lee nada (ni con la RLS de por medio), y cada
-- columna con su límite.
revoke all on public.uni_clasificacion from anon;
alter table public.uni_clasificacion
  add constraint uni_clasificacion_tnr check (tnr > 0),
  add constraint uni_clasificacion_puesto check (puesto between 1 and 2000),
  add constraint uni_clasificacion_nombre check (char_length(btrim(nombre)) between 2 and 120),
  add constraint uni_clasificacion_titulo check (char_length(titulo) <= 8),
  add constraint uni_clasificacion_club check (char_length(club) <= 120),
  add constraint uni_clasificacion_elo check (elo is null or elo between 100 and 3000),
  add constraint uni_clasificacion_puntos check (puntos is null or puntos between 0 and 99);
