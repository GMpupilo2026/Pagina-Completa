-- El calentamiento de 20 ejercicios (game_state.tanda_calentamiento): el
-- profe manda una tanda de ejercicios de Táctica con un tiempo, y cada alumno
-- resuelve los SUYOS (distintos para cada uno, del mismo nivel). Lo que viaja
-- es la receta, no los ejercicios: {at, semilla, elo, cantidad, segundos}.
-- Cada alumno arma su tanda con la semilla y su id, y el profe puede rehacer
-- la de cualquiera. Lo que lleva cada uno va en la presencia (es de ese rato),
-- como el calentamiento de una posición.
--  * Solo el profe la pone (protect_game_state_teacher_columns).
--  * `at` lo pone la base (now()) al mandar una nueva, como el de `pensar`:
--    el plazo se cuenta desde la hora del servidor, no desde la de la
--    computadora del profe.
--  * El CHECK va envuelto en coalesce(…, false): un CHECK que da NULL cuenta
--    como aprobado (ver «El mapa de jugadas, el calentamiento y el podio»).
alter table public.game_state add column if not exists tanda_calentamiento jsonb;

alter table public.game_state drop constraint if exists game_state_tanda_calentamiento_forma;
alter table public.game_state add constraint game_state_tanda_calentamiento_forma
  check (tanda_calentamiento is null or coalesce(jsonb_typeof(tanda_calentamiento) = 'object'
         and jsonb_typeof(tanda_calentamiento->'at') = 'string'
         and jsonb_typeof(tanda_calentamiento->'semilla') = 'string'
         and char_length(tanda_calentamiento->>'semilla') between 4 and 40
         and jsonb_typeof(tanda_calentamiento->'elo') = 'number'
         and jsonb_typeof(tanda_calentamiento->'cantidad') = 'number'
         and jsonb_typeof(tanda_calentamiento->'segundos') = 'number'
         and (case when jsonb_typeof(tanda_calentamiento->'elo') = 'number'
                   then (tanda_calentamiento->>'elo')::numeric between 400 and 3000 end)
         and (case when jsonb_typeof(tanda_calentamiento->'cantidad') = 'number'
                   then (tanda_calentamiento->>'cantidad')::numeric between 1 and 40 end)
         and (case when jsonb_typeof(tanda_calentamiento->'segundos') = 'number'
                   then (tanda_calentamiento->>'segundos')::numeric between 0 and 7200 end), false));

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
    new.equipos := old.equipos;
    new.tanda_calentamiento := old.tanda_calentamiento;
  else
    if new.pensar is not null
       and (old.pensar is null or new.pensar->>'at' is distinct from old.pensar->>'at') then
      new.pensar := jsonb_set(new.pensar, '{at}', to_jsonb(now()));
    end if;
    -- Una tanda nueva (otra semilla) arranca con la hora de la base.
    if new.tanda_calentamiento is not null
       and (old.tanda_calentamiento is null
            or new.tanda_calentamiento->>'semilla' is distinct from old.tanda_calentamiento->>'semilla') then
      new.tanda_calentamiento := jsonb_set(new.tanda_calentamiento, '{at}', to_jsonb(now()));
    elsif new.tanda_calentamiento is not null then
      -- La misma tanda (el profe la termina antes): el arranque no se mueve.
      new.tanda_calentamiento := jsonb_set(new.tanda_calentamiento, '{at}', old.tanda_calentamiento->'at');
    end if;
  end if;
  return new;
end;
$function$;
revoke execute on function public.protect_game_state_teacher_columns() from public, anon, authenticated;
