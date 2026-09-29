-- Tres cosas nuevas que ve toda la clase, en game_state por lo mismo que la
-- vista, el elegido y el tiempo para pensar (quien recarga o entra tarde las
-- ve igual). Solo el profesor las pone: protect_game_state_teacher_columns le
-- devuelve lo que había a cualquier otro.
--
--  * encuesta: el mapa de las jugadas que eligió la clase en una pregunta,
--    pasado al tablero de todos. {question_id, lineas: [{jugada, cuantos}]}.
--    Los números salen de resultados_de_la_pregunta(); acá solo viaja lo que
--    se muestra, sin nombres.
--  * calentamiento: una posición para resolver al entrar, mientras empieza la
--    clase. {at, fen, solucion (jugadas UCI, o null: entonces juzga el
--    motor), titulo}.
--  * podio: los puntos de la clase, cuando el profe lo muestra.
--    {at, con_nombres, lineas: [{id, nombre (null sin nombres), puntos,
--    puesto}]}. Sin nombres cada alumno se reconoce por su id.
alter table public.game_state add column if not exists encuesta jsonb;
alter table public.game_state add column if not exists calentamiento jsonb;
alter table public.game_state add column if not exists podio jsonb;

alter table public.game_state drop constraint if exists game_state_encuesta_forma;
alter table public.game_state add constraint game_state_encuesta_forma
  check (encuesta is null or (jsonb_typeof(encuesta) = 'object'
         and jsonb_typeof(encuesta->'question_id') = 'string'
         and jsonb_typeof(encuesta->'lineas') = 'array'
         and jsonb_array_length(encuesta->'lineas') <= 12));

alter table public.game_state drop constraint if exists game_state_calentamiento_forma;
alter table public.game_state add constraint game_state_calentamiento_forma
  check (calentamiento is null or (jsonb_typeof(calentamiento) = 'object'
         and jsonb_typeof(calentamiento->'at') = 'string'
         and jsonb_typeof(calentamiento->'fen') = 'string'
         and char_length(calentamiento->>'fen') between 15 and 100
         and (calentamiento->'solucion' is null or jsonb_typeof(calentamiento->'solucion') in ('null', 'array'))
         and (calentamiento->'titulo' is null or jsonb_typeof(calentamiento->'titulo') = 'null'
              or (jsonb_typeof(calentamiento->'titulo') = 'string' and char_length(calentamiento->>'titulo') <= 140))));

alter table public.game_state drop constraint if exists game_state_podio_forma;
alter table public.game_state add constraint game_state_podio_forma
  check (podio is null or (jsonb_typeof(podio) = 'object'
         and jsonb_typeof(podio->'at') = 'string'
         and jsonb_typeof(podio->'lineas') = 'array'
         and jsonb_array_length(podio->'lineas') <= 100));

create or replace function public.protect_game_state_teacher_columns()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  is_teacher boolean;
begin
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
    into is_teacher;
  if not is_teacher then
    new.arrows := old.arrows;
    new.circles := old.circles;
    new.active_player_id := old.active_player_id;
    new.vista := old.vista;
    new.comentarios := old.comentarios;
    new.elegido := old.elegido;
    new.pensar := old.pensar;
    new.encuesta := old.encuesta;
    new.calentamiento := old.calentamiento;
    new.podio := old.podio;
  elsif new.pensar is not null
        and (old.pensar is null or new.pensar->>'at' is distinct from old.pensar->>'at') then
    new.pensar := jsonb_set(new.pensar, '{at}', to_jsonb(now()));
  end if;
  return new;
end;
$function$;
revoke execute on function public.protect_game_state_teacher_columns() from public, anon, authenticated;
