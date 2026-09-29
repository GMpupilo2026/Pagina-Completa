-- Quien ayuda en una partida de práctica solo mira: el trigger le devolvía a como
-- estaban las columnas NOMBRÁNDOLAS una por una, y ya se le había escapado una
-- (reloj_ms, de la práctica con reloj): el profesor podía cambiarle el reloj al
-- alumno. Cualquier columna que se agregue después se escaparía igual y sin
-- ningún error. Ahora se copia la fila vieja ENTERA y solo se le pone la ayuda.
create or replace function public.practica_ayuda_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  ayuda_nueva jsonb := new.ayuda;
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

  -- Quien no es el alumno solo mira: la fila queda como estaba, salvo la ayuda.
  new := old;
  if ayuda_nueva is distinct from old.ayuda
     and not exists (select 1 from public.practice_sessions s
                      where s.id = old.session_id and s.ended_at is not null) then
    new.ayuda := case when ayuda_nueva is null then null
                      else ayuda_nueva || jsonb_build_object('de', yo, 'en', now()) end;
  end if;
  return new;
end;
$$;

revoke execute on function public.practica_ayuda_proteger() from public, anon, authenticated;
