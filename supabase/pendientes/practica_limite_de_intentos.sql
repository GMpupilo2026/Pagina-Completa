-- La práctica contra el motor con un límite de intentos.
--
-- El profe elige, al lanzar la ronda, cuántas partidas puede jugar cada alumno
-- (practice_sessions.max_intentos: 1 a 20, o null = sin límite). La primera
-- cuenta: «3 intentos» es la partida y dos reintentos.
--
-- Lo hace cumplir la base, no el botón (trigger practica_ayuda_proteger, la
-- rama del alumno), porque reintentar es un update de su propia fila:
-- - Un intento a la vez: attempts solo sube de a uno, nunca baja (si no, se
--   reiniciaría la cuenta mandando attempts = 1).
-- - No más de los permitidos por la ronda.
-- - Una partida terminada no vuelve a «jugando» sin gastar un intento: si no,
--   se reintentaría poniendo moves = [] y status = 'playing' con el mismo número.
-- - Al crear su fila, el alumno arranca en el intento 1, mande lo que mande
--   (trigger practica_intento_inicial).
-- Quien no es el alumno ya no toca nada de esto: el trigger le devuelve la
-- fila como estaba salvo la ayuda.

alter table public.practice_sessions add column if not exists max_intentos smallint;

alter table public.practice_sessions drop constraint if exists practice_sessions_max_intentos_rango;
alter table public.practice_sessions add constraint practice_sessions_max_intentos_rango
  check (max_intentos is null or max_intentos between 1 and 20);

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
  tope smallint;
begin
  -- Sin usuario (service role, tareas de la base): no se toca nada.
  if yo is null then
    return new;
  end if;

  if yo = old.student_id then
    -- Los intentos: de a uno, nunca para atrás, y no más de los de la ronda.
    if new.attempts is distinct from old.attempts then
      if new.attempts is null or new.attempts <> old.attempts + 1 then
        raise exception 'Los intentos se cuentan de a uno.' using errcode = 'check_violation';
      end if;
      select s.max_intentos into tope from public.practice_sessions s where s.id = old.session_id;
      if tope is not null and new.attempts > tope then
        raise exception 'Ya usaste los % intentos de esta práctica.', tope using errcode = 'check_violation';
      end if;
    elsif old.status <> 'playing' and new.status = 'playing' then
      raise exception 'Para volver a jugar, reintenta: cuenta como un intento.' using errcode = 'check_violation';
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

-- Al crear su partida, el alumno arranca en el intento 1.
create or replace function public.practica_intento_inicial()
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

revoke execute on function public.practica_intento_inicial() from public, anon, authenticated;

drop trigger if exists practica_intento_inicial on public.practice_games;
create trigger practica_intento_inicial before insert on public.practice_games
  for each row execute function public.practica_intento_inicial();
