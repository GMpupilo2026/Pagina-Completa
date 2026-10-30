-- El reloj lo lleva la base.
--
-- Hasta acá el navegador mandaba, en cada jugada, su reloj y la hora en que
-- arranca el del rival, y la base solo ponía topes. Quedaban dos huecos:
--   · una jugada guardada SIN el reloj propio no se descontaba: el trigger
--     solo miraba la columna que cambiaba;
--   · una jugada guardada sin clock_updated_at dejaba el reloj del rival
--     corriendo desde antes, con lo pensado por quien movió.
-- Ahora, en la jugada que pasa el turno (fen o el estado de Cartas con el
-- turno del otro; no en el Duelo, donde corren los dos), la base pone la hora
-- de arranque (now()) y recorta el reloj de quien movió al tope aunque no
-- venga en el UPDATE: lo que le quedaba menos lo que pasó según la base, más
-- el incremento, la tolerancia de 2 s y el retraso de 1 s. Quien juega
-- honesto no nota nada: su reloj ya venía por debajo del tope. Ver «El reloj
-- lo lleva la base» en docs/decisiones/juegos-y-torneos.md.
--
-- Ajedrez para 4 queda como estaba, por decisión.

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
  es_jugada boolean;
  tope numeric;
  cambia_turno boolean;
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

    -- (4) Nadie se sube el reloj. Con jugada, a lo sumo lo que le quedaba,
    -- más el incremento, la tolerancia y el retraso que devuelve el navegador;
    -- sin jugada, lo que ya tenía guardado. Lo que pasa de ahí se recorta: la
    -- jugada se guarda igual (una escritura que tardó en llegar no la pierde).
    es_jugada := new.fen is distinct from old.fen
                 or new.cartas_state is distinct from old.cartas_state
                 or (es_duelo and commit_nuevo is distinct from commit_viejo);
    if new.white_time_left is distinct from old.white_time_left then
      tope := case when es_jugada or old.white_time_left is null
                   then greatest(coalesce(old.white_time_left, 0) - elapsed, 0) + coalesce(old.increment_seconds, 0) + tolerancia + retraso_maximo
                   else old.white_time_left end;
      if new.white_time_left > tope then
        perform interno.anotar_recorte(new.id, 'w', new.white_time_left - tope, es_jugada);
        new.white_time_left := tope;
      end if;
    end if;
    if new.black_time_left is distinct from old.black_time_left then
      tope := case when es_jugada or old.black_time_left is null
                   then greatest(coalesce(old.black_time_left, 0) - elapsed, 0) + coalesce(old.increment_seconds, 0) + tolerancia + retraso_maximo
                   else old.black_time_left end;
      if new.black_time_left > tope then
        perform interno.anotar_recorte(new.id, 'b', new.black_time_left - tope, es_jugada);
        new.black_time_left := tope;
      end if;
    end if;
    -- (5) El reloj lo lleva la base: en la jugada que pasa el turno (no en el
    -- Duelo, donde corren los dos), la hora de arranque del reloj del rival
    -- la pone ella, y el reloj de quien movió no queda por encima del tope
    -- aunque la pantalla no lo haya mandado (antes, una jugada guardada sin
    -- el reloj propio no se le descontaba).
    cambia_turno := not es_duelo
                    and old.status = 'playing' and old.clock_updated_at is not null
                    and old.initial_seconds is not null and es_jugada
                    and split_part(coalesce(new.cartas_state ->> 'fen', new.fen, ''), ' ', 2)
                        is distinct from split_part(coalesce(old.cartas_state ->> 'fen', old.fen, ''), ' ', 2);
    if cambia_turno then
      new.clock_updated_at := now();
      if mueve = 'w' and old.white_time_left is not null then
        tope := greatest(old.white_time_left - elapsed, 0) + coalesce(old.increment_seconds, 0) + tolerancia + retraso_maximo;
        if coalesce(new.white_time_left, old.white_time_left) > tope then
          perform interno.anotar_recorte(new.id, 'w', coalesce(new.white_time_left, old.white_time_left) - tope, true);
          new.white_time_left := tope;
        end if;
      elsif mueve = 'b' and old.black_time_left is not null then
        tope := greatest(old.black_time_left - elapsed, 0) + coalesce(old.increment_seconds, 0) + tolerancia + retraso_maximo;
        if coalesce(new.black_time_left, old.black_time_left) > tope then
          perform interno.anotar_recorte(new.id, 'b', coalesce(new.black_time_left, old.black_time_left) - tope, true);
          new.black_time_left := tope;
        end if;
      end if;
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
