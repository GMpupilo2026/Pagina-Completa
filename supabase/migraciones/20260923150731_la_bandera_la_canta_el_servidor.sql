-- La bandera la canta el servidor, no la computadora.
--
-- Hasta ahora la base solo impedía SUBIRSE el reloj. Bajarlo quedaba libre:
-- el navegador calcula cuánto le queda al rival con la hora de SU computadora,
-- y una adelantada cantaba la bandera segundos antes de tiempo (o alguien
-- escribía un 0 desde la consola) y la partida terminaba con un resultado
-- falso, sin ningún error. Ahora un reloj no puede bajar más de lo que pasó
-- según now(), con la misma tolerancia de 2 segundos.
--
-- Y hora_servidor_ms() le da a las páginas la hora de la base para medir el
-- desfase de la computadora (js/reloj-servidor.js).
create or replace function public.proteger_reloj_de_partida()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  elapsed numeric;
  tolerancia constant numeric := 2;
  asiento text;
  anterior numeric;
  nuevo numeric;
  mueve text;
  le_quedaba numeric;
  corre_blancas numeric;
  corre_negras numeric;
begin
  if TG_OP = 'INSERT' then
    if new.clock_updated_at is not null then
      new.clock_updated_at := now();
    end if;
    return new;
  end if;

  -- El cliente nunca decide desde cuándo corre el reloj: se fuerza a la hora
  -- del servidor, igual que antes de este cambio.
  if new.clock_updated_at is distinct from old.clock_updated_at and new.clock_updated_at is not null then
    new.clock_updated_at := now();
  end if;

  elapsed := case when old.clock_updated_at is not null
             then greatest(extract(epoch from (now() - old.clock_updated_at)), 0)
             else 0 end;

  if TG_TABLE_NAME = 'game_rooms' then
    -- (1) Los dos listos: arranca el reloj, lo haya pedido el navegador o no.
    if old.clock_updated_at is null and new.clock_updated_at is null
       and new.initial_seconds is not null
       and coalesce(new.white_ready, false) and coalesce(new.black_ready, false)
    then
      new.clock_updated_at := now();
    end if;

    -- (2) Una jugada (cambió la posición) de quien ya estaba sin tiempo.
    if old.status = 'playing' and old.clock_updated_at is not null
       and new.fen is distinct from old.fen
    then
      mueve := split_part(coalesce(old.fen, ''), ' ', 2);
      le_quedaba := case mueve when 'w' then old.white_time_left
                               when 'b' then old.black_time_left end;
      if le_quedaba is not null and le_quedaba - elapsed < -tolerancia then
        raise exception 'Se te acabó el tiempo antes de esta jugada';
      end if;
    end if;

    -- (3) Nadie le baja el reloj a nadie más de lo que de verdad pasó. Lo que
    -- corre es solo el reloj de quien tiene el turno; el otro está quieto. Con
    -- esto la bandera cantada antes de tiempo —una computadora adelantada, o
    -- alguien escribiendo un 0 desde la consola— se rechaza: solo se puede
    -- poner un reloj en cero cuando al de verdad le quedan menos de
    -- `tolerancia` segundos según la hora del servidor.
    if old.status = 'playing' and old.clock_updated_at is not null then
      mueve := split_part(coalesce(old.cartas_state ->> 'fen', old.fen, ''), ' ', 2);
      corre_blancas := case when mueve = 'b' then 0 else elapsed end;
      corre_negras := case when mueve = 'w' then 0 else elapsed end;
    else
      corre_blancas := 0;
      corre_negras := 0;
    end if;
    if new.white_time_left is distinct from old.white_time_left
       and old.white_time_left is not null
       and coalesce(new.white_time_left, 0) < old.white_time_left - corre_blancas - tolerancia
    then
      raise exception 'Todavía le queda tiempo a las blancas';
    end if;
    if new.black_time_left is distinct from old.black_time_left
       and old.black_time_left is not null
       and coalesce(new.black_time_left, 0) < old.black_time_left - corre_negras - tolerancia
    then
      raise exception 'Todavía le queda tiempo a las negras';
    end if;

    if new.white_time_left is distinct from old.white_time_left
       and new.white_time_left > greatest(coalesce(old.white_time_left, 0) - elapsed, 0) + coalesce(old.increment_seconds, 0) + tolerancia
    then
      raise exception 'Tiempo restante inválido (blancas)';
    end if;
    if new.black_time_left is distinct from old.black_time_left
       and new.black_time_left > greatest(coalesce(old.black_time_left, 0) - elapsed, 0) + coalesce(old.increment_seconds, 0) + tolerancia
    then
      raise exception 'Tiempo restante inválido (negras)';
    end if;
  elsif TG_TABLE_NAME = 'fourplayer_games' then
    foreach asiento in array array['red', 'blue', 'yellow', 'green'] loop
      anterior := (old.seats -> asiento ->> 'time_left')::numeric;
      nuevo := (new.seats -> asiento ->> 'time_left')::numeric;
      if nuevo is distinct from anterior
         and nuevo > greatest(coalesce(anterior, 0) - elapsed, 0) + coalesce(old.increment_seconds, 0) + tolerancia
      then
        raise exception 'Tiempo restante inválido (asiento %)', asiento;
      end if;
    end loop;
  end if;

  return new;
end;
$function$;

revoke execute on function public.proteger_reloj_de_partida() from public, anon, authenticated;

create or replace function public.hora_servidor_ms()
 returns double precision
 language sql
 volatile
 set search_path to ''
as $function$
  select extract(epoch from clock_timestamp()) * 1000
$function$;

revoke execute on function public.hora_servidor_ms() from public, anon;
grant execute on function public.hora_servidor_ms() to authenticated, service_role;