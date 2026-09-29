-- El profe mira la partida de práctica de un alumno y lo ayuda sin jugar por él.
--
-- En la clase en vivo, mientras cada alumno practica contra el motor, el profesor
-- puede abrir la partida de uno en grande: la ve en vivo, NO puede mover sus piezas,
-- y le manda una ayuda (flechas, círculos y una pista escrita) que al alumno le
-- aparece en su propio tablero. La ayuda vive en la fila de la partida, así que le
-- llega por el mismo Realtime y sobrevive a una recarga.
--
-- Qué hace cumplir la base, no la pantalla:
-- - La ayuda solo la escribe alguien que NO es el alumno: la política de update ya
--   deja pasar a sus profesores y a administración; el alumno que la toca desde la
--   consola no cambia nada (se le devuelve la de antes).
-- - Quien ayuda SOLO MIRA: en su update todo lo demás (jugadas, estado, color…) se
--   devuelve a como estaba. Ninguna pantalla del profesor escribía esas columnas.
-- - La ayuda lleva quién la dio y cuándo, puestos acá y no por quien la manda.
-- - Reintentar la partida (attempts cambia) borra la ayuda: era de otra partida.
-- - Con la ronda terminada ya no se manda ayuda.
-- - La forma la cuida el CHECK: objeto, a lo sumo 12 flechas y 12 círculos, una
--   pista de hasta 280 caracteres y el número de jugadas de la posición para la
--   que se dio (las flechas solo se pintan en esa posición).

alter table public.practice_games add column if not exists ayuda jsonb;

alter table public.practice_games drop constraint if exists practice_games_ayuda_forma;
alter table public.practice_games add constraint practice_games_ayuda_forma check (
  ayuda is null or (
    jsonb_typeof(ayuda) = 'object'
    and jsonb_typeof(ayuda->'jugadas') = 'number'
    and jsonb_typeof(coalesce(ayuda->'flechas', '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(ayuda->'flechas', '[]'::jsonb)) <= 12
    and jsonb_typeof(coalesce(ayuda->'circulos', '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(ayuda->'circulos', '[]'::jsonb)) <= 12
    and char_length(coalesce(ayuda->>'texto', '')) <= 280
  )
);

create or replace function public.practica_ayuda_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
begin
  -- Sin usuario (service role, tareas de la base): no se toca nada.
  if yo is null then
    return new;
  end if;

  if yo = old.student_id then
    -- El alumno juega su partida, pero la ayuda no se la escribe él.
    new.ayuda := old.ayuda;
    if new.attempts is distinct from old.attempts then
      new.ayuda := null;
    end if;
    return new;
  end if;

  -- Quien no es el alumno solo mira: lo único que puede cambiar es la ayuda.
  new.session_id := old.session_id;
  new.student_id := old.student_id;
  new.student_color := old.student_color;
  new.fen := old.fen;
  new.moves := old.moves;
  new.status := old.status;
  new.eval_cp := old.eval_cp;
  new.attempts := old.attempts;
  new.created_at := old.created_at;
  new.updated_at := old.updated_at;

  if new.ayuda is distinct from old.ayuda then
    if exists (select 1 from public.practice_sessions s
                where s.id = old.session_id and s.ended_at is not null) then
      new.ayuda := old.ayuda;
    elsif new.ayuda is not null then
      new.ayuda := new.ayuda || jsonb_build_object('de', yo, 'en', now());
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.practica_ayuda_proteger() from public, anon, authenticated;

drop trigger if exists practica_ayuda_proteger on public.practice_games;
create trigger practica_ayuda_proteger
  before update on public.practice_games
  for each row execute function public.practica_ayuda_proteger();
