-- Los comentarios y los signos (!, ?, !?…) que el profesor le pone a las
-- jugadas de la clase. La clave es el CAMINO de jugadas desde start_fen
-- ("e4 e5 Nf3"), así que sirve igual para la línea principal y para las
-- variantes de variant_nodes, y el PGN de la clase los lleva a todos.
-- Valor: {"nag": 1..6 o null, "texto": "…"}. Se vacía cuando cambia la
-- posición de arranque (aplicarPosicionEnClase, Reiniciar): una clave de otra
-- partida no pertenece a esta.
alter table public.game_state add column if not exists comentarios jsonb not null default '{}'::jsonb;

alter table public.game_state drop constraint if exists game_state_comentarios_forma;
alter table public.game_state add constraint game_state_comentarios_forma
  check (jsonb_typeof(comentarios) = 'object' and pg_column_size(comentarios) <= 65536);

-- Solo el profesor comenta: un alumno con el control actualiza la fila (sus
-- jugadas), pero no puede escribir en los comentarios de la clase.
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
  end if;
  return new;
end;
$function$;
