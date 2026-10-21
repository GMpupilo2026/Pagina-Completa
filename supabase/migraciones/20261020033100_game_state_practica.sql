alter table public.game_state add column if not exists practica jsonb;
alter table public.game_state drop constraint if exists game_state_practica_forma;
alter table public.game_state add constraint game_state_practica_forma
  check (practica is null or coalesce(jsonb_typeof(practica) = 'object'
         and length(practica::text) <= 1500
         and jsonb_typeof(practica->'id') = 'string'
         and char_length(practica->>'id') between 4 and 40
         and jsonb_typeof(practica->'deck') = 'string'
         and (practica->>'deck') ~ '^[a-z0-9-]{1,60}/[a-z0-9-]{1,40}$'
         and jsonb_typeof(practica->'titulo') = 'string'
         and char_length(practica->>'titulo') between 1 and 160
         and jsonb_typeof(practica->'laminas') = 'array'
         and (case when jsonb_typeof(practica->'laminas') = 'array'
                   then jsonb_array_length(practica->'laminas') between 1 and 40 else false end)
         and not jsonb_path_exists(practica, '$.laminas[*] ? (@.type() != "number" || @ < 1 || @ > 500 || @ != @.floor())'), false));

create or replace function public.protect_game_state_teacher_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  is_teacher boolean;
  yo uuid := (select auth.uid());
  mio text;
  turno text;
  movido text;
  antes int;
  despues int;
begin
  select exists(select 1 from public.profiles p where p.id = yo and p.role = 'profesor')
    into is_teacher;
  if not is_teacher then
    new.arrows := old.arrows;
    new.circles := old.circles;
    new.active_player_id := old.active_player_id;
    new.active_player_color := old.active_player_color;
    new.rival_id := old.rival_id;
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
    new.practica := old.practica;

    -- Quien juega con un solo color mueve solo ese color, de a una jugada.
    if yo is not null and (yo = old.active_player_id or yo = old.rival_id) then
      mio := case when yo = old.active_player_id then old.active_player_color
                  when old.active_player_color = 'w' then 'b'
                  when old.active_player_color = 'b' then 'w' end;
      if mio is distinct from 'both' then
        antes := coalesce(jsonb_array_length(case when jsonb_typeof(old.moves) = 'array' then old.moves end), 0);
        despues := coalesce(jsonb_array_length(case when jsonb_typeof(new.moves) = 'array' then new.moves end), 0);
        turno := coalesce(nullif(split_part(coalesce(old.fen, ''), ' ', 2), ''), 'w');
        if despues = antes + 1 then
          movido := turno;
        elsif despues = antes - 1 then
          movido := case turno when 'w' then 'b' else 'w' end;
        elsif despues = antes and new.fen is not distinct from old.fen
              and new.start_fen is not distinct from old.start_fen then
          movido := null;
        else
          raise exception 'Con un solo color se juega de a una jugada.' using errcode = 'check_violation';
        end if;
        if movido is not null and movido is distinct from mio then
          raise exception 'Ese color no es el tuyo.' using errcode = 'check_violation';
        end if;
      end if;
    end if;
  else
    -- Sin control de un solo color no hay rival.
    if new.active_player_id is null
       or new.active_player_color not in ('w', 'b')
       or new.rival_id = new.active_player_id then
      new.rival_id := null;
    end if;
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