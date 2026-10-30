-- Medir las partidas en línea de verdad, no solo en la prueba.
--
-- Lo que se sabe del canal rápido, el retraso del reloj y los recortes sale
-- de verificar-partidas-simultaneas.js, con una red simulada. Para decidir si
-- vale la pena que la base calcule el reloj sola hace falta saber cómo andan
-- las partidas reales. Ver «Cómo andan las partidas en línea» en
-- docs/decisiones/juegos-y-torneos.md.
--
-- 1. partida_mediciones: lo que mide cada pantalla en su partida (cuántas
--    jugadas del rival vio, cuánto tardaron en aparecerle —la mitad, el 95 %
--    y la peor— y cuántas llegaron por el canal rápido). La manda
--    js/sala-juego.js cada 20 jugadas y al terminar, con
--    anotar_medicion_partida(), que solo deja escribir a quien juega y recorta
--    los números a un rango sano.
-- 2. reloj_recortes: cada vez que proteger_reloj_de_partida() recorta un
--    reloj de más (ver «El reloj de más se recorta, no se rechaza»), con
--    cuánto y si era una jugada. La anota interno.anotar_recorte(), que el
--    trigger llama con el permiso de quien escribe: por eso conserva el
--    execute de authenticated (interno no está en la API).
-- 3. mediciones_de_partidas(dias): el resumen, solo para quien administra
--    (lo muestra Competir).
--
-- Ninguna de las dos tablas tiene políticas: solo las tocan estas funciones.
-- Lo único nuevo en el trigger son las dos llamadas a anotar_recorte().

create table if not exists public.partida_mediciones (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  variante text,
  jugadas integer not null,
  mediana_ms integer,
  p95_ms integer,
  max_ms integer,
  rapidas integer not null default 0,
  base integer not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists partida_mediciones_actualizado_en on public.partida_mediciones (actualizado_en);
alter table public.partida_mediciones enable row level security;
revoke all on public.partida_mediciones from anon, authenticated;

create table if not exists public.reloj_recortes (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  color text not null,
  de_mas numeric not null,
  es_jugada boolean not null,
  en timestamptz not null default now()
);
create index if not exists reloj_recortes_en on public.reloj_recortes (en);
alter table public.reloj_recortes enable row level security;
revoke all on public.reloj_recortes from anon, authenticated;

create or replace function interno.anotar_recorte(p_room_id uuid, p_color text, p_de_mas numeric, p_es_jugada boolean)
 returns void
 language sql
 security definer
 set search_path to ''
as $function$
  insert into public.reloj_recortes (room_id, color, de_mas, es_jugada)
  values (p_room_id, p_color, p_de_mas, p_es_jugada);
$function$;
revoke execute on function interno.anotar_recorte(uuid, text, numeric, boolean) from public, anon;
grant execute on function interno.anotar_recorte(uuid, text, numeric, boolean) to authenticated;

create or replace function public.anotar_medicion_partida(p_room_id uuid, p_datos jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  g record;
  yo uuid := auth.uid();
  -- Un número de la pantalla, recortado a algo sano (o null).
  ms constant integer := 600000;
begin
  select id, white_id, black_id, variant into g from public.game_rooms where id = p_room_id;
  if not coalesce(g.id is not null and yo in (g.white_id, g.black_id), false) then
    raise exception 'Solo quien juega esta partida';
  end if;
  insert into public.partida_mediciones as m
    (room_id, user_id, variante, jugadas, mediana_ms, p95_ms, max_ms, rapidas, base, actualizado_en)
  values (
    p_room_id, yo, g.variant,
    least(greatest(coalesce((p_datos ->> 'jugadas')::integer, 0), 0), 2000),
    least(greatest((p_datos ->> 'mediana_ms')::integer, 0), ms),
    least(greatest((p_datos ->> 'p95_ms')::integer, 0), ms),
    least(greatest((p_datos ->> 'max_ms')::integer, 0), ms),
    least(greatest(coalesce((p_datos ->> 'rapidas')::integer, 0), 0), 2000),
    least(greatest(coalesce((p_datos ->> 'base')::integer, 0), 0), 2000),
    now())
  on conflict (room_id, user_id) do update set
    jugadas = excluded.jugadas, mediana_ms = excluded.mediana_ms, p95_ms = excluded.p95_ms,
    max_ms = excluded.max_ms, rapidas = excluded.rapidas, base = excluded.base,
    actualizado_en = now();
end;
$function$;
revoke execute on function public.anotar_medicion_partida(uuid, jsonb) from public, anon;
grant execute on function public.anotar_medicion_partida(uuid, jsonb) to authenticated;

create or replace function public.mediciones_de_partidas(p_dias integer default 30)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  desde timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365)));
  r jsonb;
begin
  if not coalesce((select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id)), false) then
    raise exception 'Solo quien administra';
  end if;
  select jsonb_build_object(
    'dias', extract(day from now() - desde)::integer,
    'partidas', count(distinct m.room_id),
    'pantallas', count(*),
    'jugadas', coalesce(sum(m.jugadas), 0),
    'mediana_ms', round(percentile_cont(0.5) within group (order by m.mediana_ms)),
    'p95_ms', round(percentile_cont(0.5) within group (order by m.p95_ms)),
    'peor_ms', max(m.max_ms),
    'por_canal_rapido', case when sum(m.rapidas + m.base) > 0
                             then round(100.0 * sum(m.rapidas) / sum(m.rapidas + m.base)) end,
    'recortes', (select count(*) from public.reloj_recortes x where x.en >= desde),
    'recortes_en_jugadas', (select count(*) from public.reloj_recortes x where x.en >= desde and x.es_jugada),
    'recorte_mayor_s', (select round(max(x.de_mas), 1) from public.reloj_recortes x where x.en >= desde)
  ) into r
  from public.partida_mediciones m
  where m.actualizado_en >= desde;
  return r;
end;
$function$;
revoke execute on function public.mediciones_de_partidas(integer) from public, anon;
grant execute on function public.mediciones_de_partidas(integer) to authenticated;

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