create or replace function public.proteger_reloj_de_partida()
returns trigger
language plpgsql
as $$
declare
  elapsed numeric;
  tolerancia constant numeric := 2;
  asiento text;
  anterior numeric;
  nuevo numeric;
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

  -- Cuánto tiempo real pasó desde que se congeló el reloj la última vez —
  -- con la hora del SERVIDOR, nunca la que mande el navegador. Es la cota
  -- máxima de cuánto puede "recuperar" quien mueve, además del incremento:
  -- antes de esto, un navegador podía escribir cualquier número en
  -- white_time_left/black_time_left (o en el time_left de un asiento) sin
  -- que nada lo comprobara.
  elapsed := case when old.clock_updated_at is not null
             then greatest(extract(epoch from (now() - old.clock_updated_at)), 0)
             else 0 end;

  if TG_TABLE_NAME = 'game_rooms' then
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
$$;