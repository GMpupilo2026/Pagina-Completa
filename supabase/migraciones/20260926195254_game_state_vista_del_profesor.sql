-- Lo que el profesor está MIRANDO en el tablero de la clase, que puede no ser
-- la posición en vivo: cuando se devuelve a una jugada anterior o recorre una
-- variante, los alumnos lo siguen en su propio tablero.
--
-- null = la posición en vivo (moves). Si no, {"path": [san...], "parent":
-- id del nodo de variant_nodes o null, "root": jugada de la línea principal
-- donde nace la variante}. Va en la base, y no por un mensaje de Realtime
-- suelto, para que quien entra tarde, recarga o supervisa vea lo mismo.
alter table public.game_state add column if not exists vista jsonb;

alter table public.game_state drop constraint if exists game_state_vista_forma;
alter table public.game_state add constraint game_state_vista_forma
  check (vista is null or (jsonb_typeof(vista) = 'object'
         and jsonb_typeof(vista->'path') = 'array'
         and jsonb_array_length(vista->'path') <= 600));

-- Solo el profesor mueve la vista: un alumno con el control actualiza la fila
-- (sus jugadas), pero no puede cambiar lo que mira la clase.
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
  end if;
  return new;
end;
$function$;
