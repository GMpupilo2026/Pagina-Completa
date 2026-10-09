-- La presentación de la clase (js/clase-presentacion.js): qué diapositiva de qué
-- presentación está mostrando el profe. null = ninguna. Va en la base y no en un
-- broadcast por lo mismo que la vista: quien entra tarde o recarga ve la misma.
-- Solo el profesor la cambia (el trigger se la devuelve a cualquier otro) y el
-- CHECK, envuelto en coalesce(…, false) porque un CHECK que da NULL aprueba,
-- exige {deck: "curso/clase-NN", n: 1..500}.
alter table public.game_state add column if not exists presentacion jsonb;
alter table public.game_state drop constraint if exists game_state_presentacion_forma;
alter table public.game_state add constraint game_state_presentacion_forma
  check (presentacion is null or coalesce(jsonb_typeof(presentacion) = 'object'
         and jsonb_typeof(presentacion->'deck') = 'string'
         and (presentacion->>'deck') ~ '^[a-z0-9-]{1,60}/[a-z0-9-]{1,40}$'
         and jsonb_typeof(presentacion->'n') = 'number'
         and (case when jsonb_typeof(presentacion->'n') = 'number'
                   then (presentacion->>'n')::numeric between 1 and 500
                        and (presentacion->>'n')::numeric = trunc((presentacion->>'n')::numeric) end), false));

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