-- Tiempo para pensar: una cuenta regresiva que ve toda la clase, sin abrir
-- una pregunta. Va en game_state por lo mismo que la vista y el elegido:
-- quien recarga o entra tarde la ve igual.
-- {"at": cuándo empezó, "segundos": cuánto dura, "texto": qué pensar (opcional)};
-- null = no hay. Se termina sola: lo que falta se calcula, no se guarda.
alter table public.game_state add column if not exists pensar jsonb;
alter table public.game_state drop constraint if exists game_state_pensar_forma;
alter table public.game_state add constraint game_state_pensar_forma
  check (pensar is null or (jsonb_typeof(pensar) = 'object'
         and jsonb_typeof(pensar->'at') = 'string'
         and jsonb_typeof(pensar->'segundos') = 'number'
         and (pensar->>'segundos')::numeric between 5 and 3600
         and (pensar->'texto' is null or jsonb_typeof(pensar->'texto') = 'null'
              or (jsonb_typeof(pensar->'texto') = 'string' and char_length(pensar->>'texto') <= 140))));

-- Solo el profesor lo pone. Y la hora de arranque la pone la base, no la
-- computadora del profe: un «at» nuevo se cambia por now(). Sumar tiempo
-- manda el mismo «at» y lo conserva.
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
  elsif new.pensar is not null
        and (old.pensar is null or new.pensar->>'at' is distinct from old.pensar->>'at') then
    new.pensar := jsonb_set(new.pensar, '{at}', to_jsonb(now()));
  end if;
  return new;
end;
$function$;
revoke execute on function public.protect_game_state_teacher_columns() from public, anon, authenticated;
