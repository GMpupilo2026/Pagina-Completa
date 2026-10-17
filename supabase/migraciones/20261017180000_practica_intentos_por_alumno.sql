-- Practicar contra el motor: el profe elige cuántos intentos tiene cada alumno.
--
-- practice_sessions.max_intentos: null es sin límite (lo de siempre); de 1 a 20,
-- el tope. Con 1, la partida no se reintenta. El profe lo elige al abrir la
-- ronda y lo puede cambiar mientras corre (darles uno más): la política de
-- UPDATE de practice_sessions ya le deja escribir su fila.
--
-- Lo hace cumplir la base, no el botón (practica_ayuda_proteger, que ya era
-- el trigger de la fila del alumno):
-- - Reintentar es SUMAR UNO: el alumno no puede volver attempts a 1 ni saltar.
-- - No se reintenta pasado el tope ni con la ronda cerrada.
-- - Una partida terminada no vuelve a «playing» sin gastar un intento: si no,
--   el tope se saltaba reiniciando la fila sin tocar el contador.
-- - Al crear su fila, el alumno arranca en el intento 1 (practica_intentos_al_crear).

alter table public.practice_sessions
  add column if not exists max_intentos integer
  check (max_intentos is null or max_intentos between 1 and 20);

comment on column public.practice_sessions.max_intentos is
  'Cuántos intentos tiene cada alumno en esta ronda (null: sin límite). Lo hace cumplir practica_ayuda_proteger.';

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
  ronda public.practice_sessions%rowtype;
begin
  -- Sin usuario (service role, tareas de la base): no se toca nada.
  if yo is null then
    return new;
  end if;

  if yo = old.student_id then
    -- Los intentos: reintentar es sumar uno, dentro del tope y con la ronda abierta.
    if new.attempts is distinct from old.attempts
       or (new.status = 'playing' and old.status is distinct from 'playing') then
      select * into ronda from public.practice_sessions s where s.id = old.session_id;
      if new.attempts is distinct from coalesce(old.attempts, 1) + 1 then
        raise exception 'Reintentar la práctica suma un intento: no se puede volver atrás ni saltar.'
          using errcode = 'check_violation';
      end if;
      if ronda.ended_at is not null then
        raise exception 'La práctica ya terminó: no se puede reintentar.'
          using errcode = 'check_violation';
      end if;
      if ronda.max_intentos is not null and new.attempts > ronda.max_intentos then
        raise exception 'Ya usaste tus % intentos de esta práctica.', ronda.max_intentos
          using errcode = 'check_violation';
      end if;
    end if;

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

-- La fila nueva del alumno arranca en el primer intento: si no, con un
-- attempts = 0 en el insert se ganaba uno de más.
create or replace function public.practica_intentos_al_crear()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select auth.uid()) is not null then
    new.attempts := 1;
  end if;
  return new;
end;
$$;

revoke execute on function public.practica_intentos_al_crear() from public, anon, authenticated;

create or replace trigger practica_intentos_al_crear
  before insert on public.practice_games
  for each row execute function public.practica_intentos_al_crear();
