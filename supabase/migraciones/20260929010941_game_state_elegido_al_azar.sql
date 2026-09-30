-- El alumno que el profe eligió al azar para responder. Va en game_state, y
-- no en un mensaje suelto de Realtime, por lo mismo que la vista: quien
-- recarga la página en ese momento tiene que enterarse igual de que le tocó.
-- {"id": uuid del alumno, "at": cuándo se eligió}; null = nadie.
alter table public.game_state add column if not exists elegido jsonb;
alter table public.game_state drop constraint if exists game_state_elegido_forma;
alter table public.game_state add constraint game_state_elegido_forma
  check (elegido is null or (jsonb_typeof(elegido) = 'object'
         and jsonb_typeof(elegido->'id') = 'string'
         and jsonb_typeof(elegido->'at') = 'string'));

-- Solo el profesor elige: un alumno con el control actualiza la fila (sus
-- jugadas), pero no puede elegirse ni «deselegirse».
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
  end if;
  return new;
end;
$function$;