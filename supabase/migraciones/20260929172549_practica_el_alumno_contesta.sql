-- El alumno le contesta a quien lo ayudó, desde su partida de práctica.
--
-- Debajo de la ayuda que le llegó (del profe, de supervisión, de coordinación,
-- o la pista para toda la clase), el alumno escribe una respuesta corta:
-- «¿el caballo de f3?», «ya la vi, gracias». Vive en SU fila de practice_games
-- (respuesta, respuesta_at) y no en el chat privado: el chat es solo entre el
-- alumno y su profe, y la ayuda la puede haber dado alguien de supervisión, que
-- tiene que leer la respuesta ahí mismo donde mandó la ayuda.
--
-- Qué hace cumplir la base (trigger practica_ayuda_proteger):
-- - Solo el alumno la escribe, y solo si tiene una ayuda a la que contestar.
--   La hora la pone la base. Borrarla (texto vacío) la quita.
-- - Quien no es el alumno no la toca (se le devuelve la fila como estaba).
-- - Una ayuda nueva, o quitar la ayuda, borra la respuesta: contestaba a otra.
-- - Reintentar la partida la borra, igual que la ayuda y el pedido.
-- - Hasta 280 caracteres, como la pista (CHECK).

alter table public.practice_games add column if not exists respuesta text;
alter table public.practice_games add column if not exists respuesta_at timestamptz;

alter table public.practice_games drop constraint if exists practice_games_respuesta_largo;
alter table public.practice_games add constraint practice_games_respuesta_largo
  check (respuesta is null or char_length(respuesta) <= 280);

create or replace function public.practica_ayuda_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  ayuda_nueva jsonb := new.ayuda;
  pide_nuevo timestamptz := new.pide_ayuda_at;
  respuesta_nueva text := nullif(btrim(coalesce(new.respuesta, '')), '');
begin
  -- Sin usuario (service role, tareas de la base): no se toca nada.
  if yo is null then
    return new;
  end if;

  if yo = old.student_id then
    -- El alumno juega su partida, pero la ayuda no se la escribe él.
    new.ayuda := old.ayuda;
    -- Su pedido sí: lo enciende y lo apaga, con la hora de la base.
    new.pide_ayuda_at := case when pide_nuevo is null then null
                              else coalesce(old.pide_ayuda_at, now()) end;
    -- Su respuesta también, pero solo si hay una ayuda a la que contestar.
    if old.ayuda is null then
      new.respuesta := old.respuesta;
      new.respuesta_at := old.respuesta_at;
    elsif respuesta_nueva is distinct from old.respuesta then
      new.respuesta := respuesta_nueva;
      new.respuesta_at := case when respuesta_nueva is null then null else now() end;
    else
      new.respuesta := old.respuesta;
      new.respuesta_at := old.respuesta_at;
    end if;
    if new.attempts is distinct from old.attempts then
      new.ayuda := null;
      new.pide_ayuda_at := null;
      new.respuesta := null;
      new.respuesta_at := null;
    end if;
    return new;
  end if;

  -- Quien no es el alumno solo mira: la fila queda como estaba, salvo la ayuda
  -- y apagar el pedido.
  new := old;
  if pide_nuevo is null then
    new.pide_ayuda_at := null;
  end if;
  if ayuda_nueva is distinct from old.ayuda
     and not exists (select 1 from public.practice_sessions s
                      where s.id = old.session_id and s.ended_at is not null) then
    new.ayuda := case when ayuda_nueva is null then null
                      else ayuda_nueva || jsonb_build_object(
                             'de', yo,
                             'en', now(),
                             'nombre', (select coalesce(nullif(p.full_name, ''), 'Alguien de la academia')
                                          from public.profiles p where p.id = yo)) end;
    -- Mandarle una ayuda es atender su pedido.
    if ayuda_nueva is not null then
      new.pide_ayuda_at := null;
    end if;
    -- La respuesta contestaba a la ayuda de antes.
    new.respuesta := null;
    new.respuesta_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.practica_ayuda_proteger() from public, anon, authenticated;