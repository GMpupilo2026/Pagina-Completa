-- ------------------------------------------------------------ partidas de a dos
drop policy if exists game_rooms_select on public.game_rooms;
create policy game_rooms_select on public.game_rooms
  for select using (
    auth.uid() = white_id
    or auth.uid() = black_id
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de_alguno(array[white_id, black_id])
    -- o alguno de los dos es compañero mío: así el resto de la clase puede mirar.
    or public.es_companero(white_id) or public.es_companero(black_id)
  );

drop policy if exists game_rooms_update on public.game_rooms;
create policy game_rooms_update on public.game_rooms
  for update using (
    auth.uid() = white_id
    or auth.uid() = black_id
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de_alguno(array[white_id, black_id])
  ) with check (
    auth.uid() = white_id
    or auth.uid() = black_id
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de_alguno(array[white_id, black_id])
  );

drop policy if exists game_rooms_delete on public.game_rooms;
create policy game_rooms_delete on public.game_rooms
  for delete using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de_alguno(array[white_id, black_id])
  );

-- Para armar una partida hay que ser profesor de LOS DOS jugadores, igual que
-- antes: no se puede sentar en el tablero a un alumno de otro.
drop policy if exists game_rooms_insert on public.game_rooms;
create policy game_rooms_insert on public.game_rooms
  for insert with check (
    (select my_profile.role from public.my_profile() my_profile(role, is_admin, teacher_id)) = 'profesor'
    and created_by = auth.uid()
    and public.soy_profesor_de_todos(array[white_id, black_id])
  );

-- ------------------------------------------------------------ partidas de a cuatro
drop policy if exists fourplayer_games_select on public.fourplayer_games;
create policy fourplayer_games_select on public.fourplayer_games
  for select using (
    auth.uid() = any (public.jugadores_de_asientos(seats))
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de_alguno(public.jugadores_de_asientos(seats))
  );

drop policy if exists fourplayer_games_update on public.fourplayer_games;
create policy fourplayer_games_update on public.fourplayer_games
  for update using (
    auth.uid() = any (public.jugadores_de_asientos(seats))
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de_alguno(public.jugadores_de_asientos(seats))
  ) with check (
    auth.uid() = any (public.jugadores_de_asientos(seats))
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de_alguno(public.jugadores_de_asientos(seats))
  );

drop policy if exists fourplayer_games_delete on public.fourplayer_games;
create policy fourplayer_games_delete on public.fourplayer_games
  for delete using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de_alguno(public.jugadores_de_asientos(seats))
  );

drop policy if exists fourplayer_games_insert on public.fourplayer_games;
create policy fourplayer_games_insert on public.fourplayer_games
  for insert with check (
    (select my_profile.role from public.my_profile() my_profile(role, is_admin, teacher_id)) = 'profesor'
    and public.soy_profesor_de_todos(public.jugadores_de_asientos(seats))
  );

-- ------------------------------------------------------------ retos
drop policy if exists desafios_select on public.desafios;
create policy desafios_select on public.desafios
  for select using (
    auth.uid() = de_id
    or auth.uid() = para_id
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de_alguno(array[de_id, para_id])
  );

-- ------------------------------------------------------------ torneos
drop policy if exists tournaments_select on public.tournaments;
create policy tournaments_select on public.tournaments
  for select using (
    created_by = auth.uid()
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.es_mi_profesor(created_by)
  );

drop policy if exists tournament_registrations_select on public.tournament_registrations;
create policy tournament_registrations_select on public.tournament_registrations
  for select using (
    exists (select 1 from public.tournaments t
            where t.id = tournament_id
              and (t.created_by = auth.uid()
                   or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
                   or public.es_mi_profesor(t.created_by)))
  );

drop policy if exists tournament_rounds_select on public.tournament_rounds;
create policy tournament_rounds_select on public.tournament_rounds
  for select using (
    exists (select 1 from public.tournaments t
            where t.id = tournament_id
              and (t.created_by = auth.uid()
                   or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
                   or public.es_mi_profesor(t.created_by)))
  );

drop policy if exists tournament_pairings_select on public.tournament_pairings;
create policy tournament_pairings_select on public.tournament_pairings
  for select using (
    exists (select 1 from public.tournaments t
            where t.id = tournament_id
              and (t.created_by = auth.uid()
                   or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
                   or public.es_mi_profesor(t.created_by)))
  );

drop policy if exists tournament_registrations_insert on public.tournament_registrations;
create policy tournament_registrations_insert on public.tournament_registrations
  for insert with check (
    (player_id = auth.uid()
     and exists (select 1 from public.tournaments t
                 where t.id = tournament_id and t.status = 'registration'
                   and public.es_mi_profesor(t.created_by)))
    or exists (select 1 from public.tournaments t
               where t.id = tournament_id
                 and (t.created_by = auth.uid()
                      or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))))
  );

-- ------------------------------------------------------------ perfiles
-- Quién ve a quién en la libreta de direcciones del sitio. Cambia una cosa de
-- fondo: "compañeros de clase" ahora se pregunta con es_companero(), que mira
-- profile_teachers, y ahí solo figuran alumnos. Antes bastaba con tener
-- teacher_id puesto — y un profesor lo tenía —, así que un profesor recién
-- creado, sin un solo alumno asignado, veía la clase entera de quien lo creó.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    auth.uid() = id
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(id)
    or public.es_mi_profesor(id)
    or public.es_companero(id)
  );