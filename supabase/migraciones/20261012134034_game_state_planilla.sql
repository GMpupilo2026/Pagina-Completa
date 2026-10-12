-- La planilla en vivo de la clase (js/clase-planilla.js): al lado del tablero,
-- la planilla de torneo que se llena sola con las jugadas, para enseñar cómo se
-- anota una partida. null = no se muestra. Las jugadas NO van acá (salen de
-- moves y start_fen, como el tablero): solo lo que el profe le agrega, los
-- nombres de los jugadores, las ofertas de tablas (el número de media jugada)
-- y el resultado. Va en la base por lo mismo que la presentación: quien entra
-- tarde o recarga la ve igual. Solo el profesor la cambia (el trigger se la
-- devuelve a cualquier otro) y el CHECK, envuelto en coalesce(…, false) porque
-- un CHECK que da NULL aprueba, exige esa forma y menos de 4 KB.
alter table public.game_state add column if not exists planilla jsonb;
alter table public.game_state drop constraint if exists game_state_planilla_forma;
alter table public.game_state add constraint game_state_planilla_forma
  check (planilla is null or coalesce(jsonb_typeof(planilla) = 'object'
         and length(planilla::text) <= 4000
         and (not planilla ? 'blancas' or (jsonb_typeof(planilla->'blancas') = 'string' and char_length(planilla->>'blancas') <= 60))
         and (not planilla ? 'negras' or (jsonb_typeof(planilla->'negras') = 'string' and char_length(planilla->>'negras') <= 60))
         and (not planilla ? 'resultado' or planilla->>'resultado' in ('', '1-0', '0-1', '½-½'))
         -- (CASE: el orden de un AND no está garantizado, y jsonb_array_length
         -- sobre algo que no es un arreglo da error en vez de false.)
         and (not planilla ? 'tablas' or (case when jsonb_typeof(planilla->'tablas') = 'array'
              then jsonb_array_length(planilla->'tablas') <= 100 else false end)), false));

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
    new.presentacion := old.presentacion;
    new.planilla := old.planilla;
  else
    if new.pensar is not null
       and (old.pensar is null or new.pensar->>'at' is distinct from old.pensar->>'at') then
      new.pensar := jsonb_set(new.pensar, '{at}', to_jsonb(now()));
    end if;
    -- Una tanda nueva (otra semilla) arranca con la hora de la base.
    -- (Solo a un objeto: lo que no lo es lo rechaza el CHECK, no un error de jsonb_set.)
    if jsonb_typeof(new.tanda_calentamiento) = 'object'
       and (jsonb_typeof(old.tanda_calentamiento) is distinct from 'object'
            or new.tanda_calentamiento->>'semilla' is distinct from old.tanda_calentamiento->>'semilla') then
      new.tanda_calentamiento := jsonb_set(new.tanda_calentamiento, '{at}', to_jsonb(now()));
    elsif jsonb_typeof(new.tanda_calentamiento) = 'object' then
      -- La misma tanda (el profe la termina antes): el arranque no se mueve.
      new.tanda_calentamiento := jsonb_set(new.tanda_calentamiento, '{at}', old.tanda_calentamiento->'at');
    end if;
  end if;
  return new;
end;
$function$;
revoke execute on function public.protect_game_state_teacher_columns() from public, anon, authenticated;