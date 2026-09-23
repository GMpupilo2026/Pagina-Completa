-- Dos huecos del reloj de partida que no daban ningún error:
--
-- 1) «Estoy listo» a la vez. El navegador solo ponía clock_updated_at si al
--    confirmar veía al rival YA listo en su copia; si los dos confirmaban en
--    el mismo medio segundo, ninguno lo veía y el reloj no arrancaba nunca:
--    las blancas pensaban su primera jugada gratis e indefinidamente. Ahora lo
--    pone la base cuando las dos banderas quedan en true (el UPDATE que llega
--    segundo ya ve la del otro, porque la fila está bloqueada).
--
-- 2) Jugar con la bandera caída. La validación dejaba pasar la jugada de
--    quien ya se había quedado sin tiempo (greatest(... , 0) + incremento +
--    tolerancia), así que un mate que llegaba después de la bandera pisaba el
--    resultado. Ahora una jugada de quien lleva más de la tolerancia en cero
--    se rechaza.
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
