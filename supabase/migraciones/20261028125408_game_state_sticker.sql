-- Los stickers del profe en la clase en vivo (js/clase-stickers.js): el dibujo
-- del profe Oscar con una frase, unos segundos encima de la clase.
-- game_state.sticker = {id, texto, para, at}:
--   id    el dibujo (img/profe-oscar/<id>.webp), letras, números y guiones;
--   texto la frase, hasta 120 letras, o null;
--   para  un alumno (uuid) o null = toda la clase;
--   at    la hora: la pone la base, como en el tiempo para pensar.
-- Solo el profe lo escribe: protect_game_state_teacher_columns se lo devuelve
-- al alumno. La función se reescribe ENTERA, con todas las columnas que ya
-- protegía (verificar-game-state-protegido.js lo revisa).
alter table public.game_state add column if not exists sticker jsonb;
alter table public.game_state drop constraint if exists game_state_sticker_forma;
alter table public.game_state add constraint game_state_sticker_forma
  check (sticker is null or coalesce(jsonb_typeof(sticker) = 'object'
         and length(sticker::text) <= 600
         and jsonb_typeof(sticker->'id') = 'string'
         and (sticker->>'id') ~ '^[a-z0-9-]{1,40}$'
         and coalesce(jsonb_typeof(sticker->'texto'), 'null') in ('string', 'null')
         and char_length(coalesce(sticker->>'texto', '')) <= 120
         and (coalesce(jsonb_typeof(sticker->'para'), 'null') = 'null'
              or (jsonb_typeof(sticker->'para') = 'string'
                  and (sticker->>'para') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')), false));

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
    new.sticker := old.sticker;

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
    -- Cada sticker que se manda lleva la hora de la base: con ella cada
    -- pantalla sabe si todavía se ve (y quien entra después no ve uno viejo).
    if jsonb_typeof(new.sticker) = 'object'
       and new.sticker is distinct from old.sticker then
      new.sticker := jsonb_set(new.sticker, '{at}', to_jsonb(now()));
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
