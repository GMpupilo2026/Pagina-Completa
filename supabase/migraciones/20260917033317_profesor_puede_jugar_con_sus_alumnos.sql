-- El profesor puede SENTARSE a jugar, no solo armar partidas ajenas.
--
-- Hasta ahora, armar una partida exigía soy_profesor_de_todos([jugadores]), que
-- pregunta si cada jugador es alumno mío. Un profesor no es alumno de sí mismo
-- —profile_teachers solo tiene alumnos como student_id—, así que ponerse en el
-- tablero daba false y la fila se rechazaba. Y no era solo el formulario de
-- Juegos: torneo.html inserta en game_rooms al generar cada ronda, así que un
-- profesor inscrito en su propio torneo tumbaba la ronda entera.
--
-- La pregunta correcta no es "¿son todos alumnos míos?" sino "¿puedo sentar a
-- esta gente en un tablero?", que es la misma más una excepción: yo.

create or replace function public.puedo_armar_partida_con(p_jugadores uuid[])
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- Quien administra arma partidas con cualquiera; el profesor, con sus
  -- alumnos y consigo mismo. Cualquier otro rol, con nadie.
  select (select is_admin from public.my_profile())
     or (
       (select role from public.my_profile()) = 'profesor'
       and not exists (
         select 1 from unnest(p_jugadores) as j(id)
         where j.id is not null
           and j.id <> auth.uid()                      -- yo siempre puedo estar
           and not exists (
             select 1 from public.profile_teachers pt
             where pt.student_id = j.id and pt.teacher_id = auth.uid()
           )
       )
     );
$function$;

comment on function public.puedo_armar_partida_con(uuid[]) is
  'Si quien llama puede crear una partida con esos jugadores: administración con cualquiera, el profesor con sus alumnos y consigo mismo.';

-- game_rooms: además se exige que blancas y negras sean distintos. Antes lo
-- impedía de rebote soy_profesor_de_todos (nadie es alumno de sí mismo); al
-- abrir la excepción del "yo", sin esto un profesor podría crearse una partida
-- contra sí mismo.
drop policy if exists game_rooms_insert on public.game_rooms;
create policy game_rooms_insert on public.game_rooms
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and white_id is distinct from black_id
    and public.puedo_armar_partida_con(array[white_id, black_id])
  );

drop policy if exists fourplayer_games_insert on public.fourplayer_games;
create policy fourplayer_games_insert on public.fourplayer_games
  for insert to authenticated
  with check (
    public.puedo_armar_partida_con(public.jugadores_de_asientos(seats))
  );