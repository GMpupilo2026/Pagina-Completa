-- El retraso de la red no se cobra en el reloj (como en lichess, con tope).
--
-- El reloj de quien recibe una jugada corre desde que la base la guardó
-- (clock_updated_at), pero la ve en su pantalla un rato después: lo que tarda
-- Realtime en avisarle, que con la base cargada son segundos. Ese rato se le
-- cobraba como si lo hubiera pensado. Ahora el navegador cuenta lo pensado
-- desde que la jugada apareció en su pantalla (js/sala-juego.js, pensado()),
-- con un tope de 1 s por jugada, y este trigger deja pasar ese segundo de más
-- en el tiempo que se escribe al mover (retraso_maximo). Nada más cambia:
--   · La base no puede saber cuándo vio cada uno la jugada: lo dice el
--     navegador. Por eso el tope. Quien haga trampa desde la consola gana a lo
--     sumo 1 s por jugada, además de los 2 s de tolerancia de siempre.
--   · La bandera no cambia: el segundo se abona solo al mover a tiempo, nunca
--     salva de que caiga la bandera (las comprobaciones (2) y (3) siguen con
--     la tolerancia de siempre).
--   · Ajedrez para 4 (fourplayer_games) no lo lleva todavía: su navegador no
--     lo pide.
-- Ver «El retraso de la red no se cobra en el reloj» en
-- docs/decisiones/juegos-y-torneos.md.

create or replace function public.proteger_reloj_de_partida()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  elapsed numeric;
  tolerancia constant numeric := 2;
  -- Lo que el navegador devuelve como máximo por la jugada que tardó en llegarle.
  retraso_maximo constant numeric := 1;
  asiento text;
  anterior numeric;
  nuevo numeric;
  mueve text;
  le_quedaba numeric;
  corre_blancas numeric;
  corre_negras numeric;
  color text;
  es_duelo boolean;
  commit_viejo jsonb;
  commit_nuevo jsonb;
begin
  if TG_OP = 'INSERT' then
    if new.clock_updated_at is not null then
      new.clock_updated_at := now();
    end if;
    return new;
  end if;

  if new.clock_updated_at is distinct from old.clock_updated_at and new.clock_updated_at is not null then
    new.clock_updated_at := now();
  end if;

  elapsed := case when old.clock_updated_at is not null
             then greatest(extract(epoch from (now() - old.clock_updated_at)), 0)
             else 0 end;

  if TG_TABLE_NAME = 'game_rooms' then
    -- Lo del duelo se lee con to_jsonb(): este trigger también corre en
    -- fourplayer_games, que no tiene esas columnas.
    es_duelo := (to_jsonb(old) ->> 'variant') = 'duelo';
    commit_viejo := to_jsonb(old) -> 'duelo_state' -> 'commit';
    commit_nuevo := to_jsonb(new) -> 'duelo_state' -> 'commit';
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
    -- En el duelo la jugada es el compromiso (commit) de cada color.
    if es_duelo and old.status = 'playing' and old.clock_updated_at is not null then
      foreach color in array array['w', 'b'] loop
        if (commit_viejo ->> color) is null
           and (commit_nuevo ->> color) is not null
        then
          le_quedaba := case color when 'w' then old.white_time_left else old.black_time_left end;
          if le_quedaba is not null and le_quedaba - elapsed < -tolerancia then
            raise exception 'Se te acabó el tiempo antes de esta jugada';
          end if;
        end if;
      end loop;
    end if;

    -- (3) Nadie le baja el reloj a nadie más de lo que de verdad pasó.
    if old.status = 'playing' and old.clock_updated_at is not null then
      if es_duelo then
        -- En el duelo corren los dos, menos el de quien ya confirmó su jugada.
        corre_blancas := case when (commit_viejo ->> 'w') is not null then 0 else elapsed end;
        corre_negras := case when (commit_viejo ->> 'b') is not null then 0 else elapsed end;
      else
        mueve := split_part(coalesce(old.cartas_state ->> 'fen', old.fen, ''), ' ', 2);
        corre_blancas := case when mueve = 'b' then 0 else elapsed end;
        corre_negras := case when mueve = 'w' then 0 else elapsed end;
      end if;
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

    -- (4) Nadie se sube el reloj: a lo sumo lo que le quedaba, más el
    -- incremento, la tolerancia y el retraso que devuelve el navegador.
    if new.white_time_left is distinct from old.white_time_left
       and new.white_time_left > greatest(coalesce(old.white_time_left, 0) - elapsed, 0) + coalesce(old.increment_seconds, 0) + tolerancia + retraso_maximo
    then
      raise exception 'Tiempo restante inválido (blancas)';
    end if;
    if new.black_time_left is distinct from old.black_time_left
       and new.black_time_left > greatest(coalesce(old.black_time_left, 0) - elapsed, 0) + coalesce(old.increment_seconds, 0) + tolerancia + retraso_maximo
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