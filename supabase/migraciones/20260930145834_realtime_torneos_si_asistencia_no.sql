-- Lo que escucha el sitio por Realtime y lo que está publicado no coincidían.
--
-- 1. torneo.js escucha tournaments, tournament_registrations,
--    tournament_rounds y tournament_pairings (filtrado por torneo), pero
--    ninguna de las cuatro estaba en supabase_realtime: esas suscripciones no
--    recibían nada, sin ningún error. Quien miraba un torneo interno no veía el
--    resultado de una partida ni la ronda nueva hasta recargar (las jugadas sí
--    llegaban, por game_rooms). La RLS de las cuatro decide qué le llega a cada
--    uno, igual que al leerlas: nadie recibe más de lo que ya ve.
-- 2. class_attendance estaba publicada y nadie la escucha (solo se escribe con
--    upsert y se lee con select): cada asistencia marcada le daba trabajo a
--    Realtime para nada.
alter publication supabase_realtime add table
  public.tournaments,
  public.tournament_registrations,
  public.tournament_rounds,
  public.tournament_pairings;

alter publication supabase_realtime drop table public.class_attendance;
