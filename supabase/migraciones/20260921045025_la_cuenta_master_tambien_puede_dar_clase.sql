-- Cinco políticas pedían `role = 'profesor'` A SECAS, así que la cuenta
-- master (role = 'admin' desde que dejó de ser alumna) no podía abrir una
-- clase en vivo, plantear una pregunta, abrir una ronda de práctica, guardar
-- una partida ni subir un PGN. Quedaba escrito como pendiente en CLAUDE.md.
--
-- Es la regla permanente de la casa: todo lo que se hace para los profesores
-- se hace también para quien administra, con el alcance que ya le da la base.
-- Coordinar nunca quitó nada —quien coordina sigue teniendo role='profesor'—,
-- lo que faltaba era esto.
drop policy if exists class_sessions_insert on public.class_sessions;
create policy class_sessions_insert on public.class_sessions for insert
  with check (
    created_by = auth.uid()
    and (select mp.is_admin or mp.role = 'profesor' from public.my_profile() mp)
  );

drop policy if exists questions_insert on public.questions;
create policy questions_insert on public.questions for insert
  with check (
    created_by = auth.uid()
    and (select mp.is_admin or mp.role = 'profesor' from public.my_profile() mp)
  );

drop policy if exists practice_sessions_insert on public.practice_sessions;
create policy practice_sessions_insert on public.practice_sessions for insert
  with check (
    created_by = auth.uid()
    and (select mp.is_admin or mp.role = 'profesor' from public.my_profile() mp)
  );

drop policy if exists saved_games_insert on public.saved_games;
create policy saved_games_insert on public.saved_games for insert
  with check (
    created_by = auth.uid()
    and (select mp.is_admin or mp.role = 'profesor' from public.my_profile() mp)
  );

drop policy if exists archivos_pgn_insert on public.archivos_pgn;
create policy archivos_pgn_insert on public.archivos_pgn for insert
  with check (
    profesor_id = auth.uid()
    and (select mp.is_admin or mp.role = 'profesor' from public.my_profile() mp)
  );

-- Esta además preguntaba por `profiles` directo en vez de por my_profile(),
-- que es la que existe justamente para no volver a pasar por la RLS.
drop policy if exists tv_settings_update_profesor on public.tv_settings;
create policy tv_settings_update_profesor on public.tv_settings for update
  using ((select mp.is_admin or mp.role = 'profesor' from public.my_profile() mp))
  with check ((select mp.is_admin or mp.role = 'profesor' from public.my_profile() mp));