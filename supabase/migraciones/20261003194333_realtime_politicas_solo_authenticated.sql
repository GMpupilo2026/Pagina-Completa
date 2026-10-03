-- Realtime perdía jugadas: las políticas de lectura de las tablas publicadas
-- quedan solo para `authenticated`. Ver el archivo en supabase/migraciones/.
alter policy archivos_pgn_select on public.archivos_pgn to authenticated;
alter policy class_chat_messages_select on public.class_chat_messages to authenticated;
alter policy class_sessions_select on public.class_sessions to authenticated;
alter policy desafios_select on public.desafios to authenticated;
alter policy fourplayer_games_select on public.fourplayer_games to authenticated;
alter policy game_rooms_select on public.game_rooms to authenticated;
alter policy game_state_select on public.game_state to authenticated;
alter policy practice_games_select on public.practice_games to authenticated;
alter policy practice_sessions_select on public.practice_sessions to authenticated;
alter policy question_answers_select on public.question_answers to authenticated;
alter policy questions_select on public.questions to authenticated;
alter policy saved_games_select on public.saved_games to authenticated;
alter policy tournament_pairings_select on public.tournament_pairings to authenticated;
alter policy tournament_registrations_select on public.tournament_registrations to authenticated;
alter policy tournament_rounds_select on public.tournament_rounds to authenticated;
alter policy tournaments_select on public.tournaments to authenticated;
alter policy variant_nodes_select on public.variant_nodes to authenticated;