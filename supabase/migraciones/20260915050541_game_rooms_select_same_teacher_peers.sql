-- Permite que cualquier alumno vea las partidas de game_rooms de sus
-- compañeros bajo el mismo profesor (no solo las propias, ni solo el
-- profesor) — necesario para que "TV en vivo" pueda mostrar TODAS las
-- partidas de la academia en curso, no solo las del profesor o del propio
-- alumno. Mismo patrón ya usado en fourplayer_games, class_sessions,
-- questions y question_answers en este mismo proyecto.
drop policy if exists "game_rooms_select" on public.game_rooms;
create policy "game_rooms_select" on public.game_rooms for select
using (
  auth.uid() = white_id
  or auth.uid() = black_id
  or (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
  or exists (
    select 1 from profiles st
    where st.id = any (array[game_rooms.white_id, game_rooms.black_id])
      and st.teacher_id = auth.uid()
  )
  or exists (
    select 1 from profiles st
    where st.id = any (array[game_rooms.white_id, game_rooms.black_id])
      and st.teacher_id is not null
      and st.teacher_id = (select my_profile.teacher_id from my_profile() my_profile(role, is_admin, teacher_id))
  )
);
