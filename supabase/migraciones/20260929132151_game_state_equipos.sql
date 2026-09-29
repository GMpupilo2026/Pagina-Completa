-- Los equipos de la clase (game_state.equipos): el profe reparte a los
-- conectados en dos a cuatro equipos que compiten por puntos. Va en
-- game_state por lo mismo que el podio: lo ve toda la clase, también quien
-- entra tarde o recarga. {at, lista: [{nombre, color, miembros: [{id, nombre}]}]}.
-- Los puntos de cada equipo no se guardan: son la suma de los de sus
-- integrantes (resumen_de_la_clase), y se calculan.
alter table public.game_state add column if not exists equipos jsonb;

alter table public.game_state drop constraint if exists game_state_equipos_forma;
alter table public.game_state add constraint game_state_equipos_forma
  check (equipos is null or coalesce(jsonb_typeof(equipos) = 'object'
         and jsonb_typeof(equipos->'at') = 'string'
         and jsonb_typeof(equipos->'lista') = 'array'
         and jsonb_array_length(equipos->'lista') between 2 and 4, false));

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
  elsif new.pensar is not null
        and (old.pensar is null or new.pensar->>'at' is distinct from old.pensar->>'at') then
    new.pensar := jsonb_set(new.pensar, '{at}', to_jsonb(now()));
  end if;
  return new;
end;
$function$;
revoke execute on function public.protect_game_state_teacher_columns() from public, anon, authenticated;
