-- El formato «Arena» dentro de los torneos de la Academia.
--
-- Una arena no tiene rondas: dura un tiempo (arena_minutos) y, mientras dura,
-- cada quien pide rival y la base lo sienta con el siguiente que espera. Es el
-- mismo juego de la sala de arena entre equipos («Base de Colegios»), pero con
-- las cuentas, las modalidades y las partidas (game_rooms) de la Academia.
--
-- Lo que lleva la base, y por qué no el navegador:
--   · el emparejamiento (arena_buscar, con un candado por torneo): dos pantallas
--     no pueden sentar al mismo jugador en dos mesas;
--   · la hora en que termina (arena_termina la pone arena_empezar con now()):
--     la computadora de nadie decide cuánto dura;
--   · el resultado de cada partida en su cruce (trigger sobre game_rooms, con
--     la hora de la base): en los otros formatos lo escribe el navegador de
--     quien esté mirando, y acá el orden de las partidas decide la racha;
--   · la clasificación (arena_clasificacion): victoria 2, tablas 1, y con dos
--     victorias seguidas la partida siguiente vale el doble; unas tablas de
--     menos de 20 medias jugadas no dan nada. No se guarda: se calcula;
--   · el cierre (arena_cerrar): lo pide cualquiera que esté mirando cuando se
--     acaba el tiempo y lo hace UNO (candado y estado). Lo que termina después
--     de la hora no cuenta, como en Lichess.
--
-- Lo que la base NO comprueba, igual que en el resto de Juegos: si una jugada
-- es legal o un mate es mate (eso lo calcula el navegador de quien mueve), y
-- la posición de salida de las modalidades cuyo arranque vive en el
-- navegador (Cartas, Duelo, Abrazos, Camaleón, A ciegas, Vampiro, los
-- volcanes): llega con el pedido, como en aceptar_desafio().

alter table public.tournaments drop constraint tournaments_format_check;
alter table public.tournaments add constraint tournaments_format_check
  check (format = any (array['swiss'::text, 'elimination'::text, 'round_robin'::text, 'arena'::text]));

alter table public.tournaments add column arena_minutos integer;
alter table public.tournaments add column arena_termina timestamptz;
-- Una arena lleva su duración y su reloj, y no es «aleatoria» (el sorteo es
-- por ronda, y acá no hay rondas); los demás formatos no llevan nada de esto.
alter table public.tournaments add constraint tournaments_arena_check check (
  (format = 'arena' and arena_minutos between 5 and 240
     and variant <> 'aleatorio' and initial_seconds is not null)
  or (format <> 'arena' and arena_minutos is null and arena_termina is null));

-- Cuántas medias jugadas tuvo la partida, anotado al terminar: unas tablas
-- rápidas no dan puntos, y contarlas en game_rooms pediría leer esa tabla
-- (con su RLS, fila por fila) en cada clasificación.
alter table public.tournament_pairings add column jugadas integer;

-- Quién espera rival. Nadie la lee ni la escribe desde afuera: solo las
-- funciones arena_* (RLS sin ninguna política).
create table public.tournament_arena_cola (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  desde timestamptz not null default now(),
  visto timestamptz not null default now(),
  primary key (tournament_id, player_id)
);
create index tournament_arena_cola_player_id_fk on public.tournament_arena_cola (player_id);
alter table public.tournament_arena_cola enable row level security;
revoke all on public.tournament_arena_cola from anon, authenticated;

-- A una arena se puede entrar con el torneo ya empezado.
alter policy tournament_registrations_insert on public.tournament_registrations
  with check (
    ((player_id = (select auth.uid())) and (exists (
       select 1 from public.tournaments t
        where t.id = tournament_registrations.tournament_id
          and (t.status = 'registration' or (t.format = 'arena' and t.status = 'in_progress'))
          and public.es_mi_profesor(t.created_by))))
    or (exists (
       select 1 from public.tournaments t
        where t.id = tournament_registrations.tournament_id
          and ((t.created_by = (select auth.uid()))
               or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))))));

-- La duración y la hora de cierre de la arena son de quien organiza: a un
-- inscrito (que puede escribir el torneo, ver tournaments_update) se le
-- revierten en silencio, igual que el ritmo.
create or replace function public.proteger_torneo()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.current_round := greatest(coalesce(new.current_round, 0), coalesce(old.current_round, 0));
  if old.status <> 'registration' and new.status = 'registration' then
    new.status := old.status;
  end if;
  if old.created_by = auth.uid() or coalesce((select m.is_admin from public.my_profile() m), false) then
    if old.status = 'finished'
       and (new.initial_seconds is distinct from old.initial_seconds
            or new.increment_seconds is distinct from old.increment_seconds) then
      raise exception 'El torneo ya terminó: su tiempo ya no se puede cambiar';
    end if;
    if old.status = 'finished' and new.modos_aleatorio is distinct from old.modos_aleatorio then
      raise exception 'El torneo ya terminó: sus modalidades ya no se pueden cambiar';
    end if;
    return new;
  end if;
  new.name := old.name;
  new.format := old.format;
  new.variant := old.variant;
  new.modos_aleatorio := old.modos_aleatorio;
  new.initial_seconds := old.initial_seconds;
  new.increment_seconds := old.increment_seconds;
  new.created_by := old.created_by;
  new.arena_minutos := old.arena_minutos;
  new.arena_termina := old.arena_termina;
  return new;
end;
$function$;

-- Empezar la arena: la hora de cierre la pone la base. Corre con los permisos
-- de quien llama (la RLS ya decide quién escribe), pero tournaments_update
-- deja escribir también a los inscritos: por eso se pregunta acá quién es.
create function public.arena_empezar(p_torneo uuid)
 returns timestamptz
 language plpgsql
 set search_path to ''
as $function$
declare
  v_termina timestamptz;
begin
  if (select count(*) from public.tournament_registrations r where r.tournament_id = p_torneo) < 2 then
    raise exception 'Hacen falta al menos 2 inscritos.' using errcode = '22023';
  end if;
  update public.tournaments t
     set status = 'in_progress', started_at = now(), updated_at = now(),
         total_rounds = 1, current_round = 1,
         arena_termina = now() + make_interval(mins => t.arena_minutos)
   where t.id = p_torneo and t.format = 'arena' and t.status = 'registration'
     and coalesce(t.created_by = (select auth.uid())
                  or (select m.is_admin from public.my_profile() m), false)
  returning t.arena_termina into v_termina;
  if not found then
    raise exception 'Esta arena ya empezó, o no la organizas tú.' using errcode = '42501';
  end if;
  -- Todas las partidas de la arena cuelgan de una sola ronda.
  insert into public.tournament_rounds (tournament_id, round_number) values (p_torneo, 1);
  return v_termina;
end;
$function$;
revoke execute on function public.arena_empezar(uuid) from public, anon;
grant execute on function public.arena_empezar(uuid) to authenticated;

-- «Busco rival», y también el «sigo aquí»: la pantalla la llama cada pocos
-- segundos mientras espera. Quien dejó de llamar hace 12 segundos ya no se
-- empareja. El rival: quien más lleva esperando, distinto del último con el
-- que jugó; la revancha, solo si alguno de los dos lleva 10 segundos.
create function public.arena_buscar(
  p_torneo uuid,
  p_fen text default null,
  p_cartas jsonb default null,
  p_duelo jsonb default null,
  p_variant jsonb default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_yo uuid := auth.uid();
  t public.tournaments;
  v_sala uuid;
  v_rival uuid;
  v_ultimo uuid;
  v_desde timestamptz;
  v_ronda uuid;
  v_blancas uuid;
  v_negras uuid;
  v_dif_yo integer;
  v_dif_rival integer;
  v_fen text;
  v_clasica constant text := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  v_con_reserva constant text := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1';
begin
  if v_yo is null then
    raise exception 'Hace falta entrar con tu cuenta.' using errcode = '42501';
  end if;
  if not coalesce(public.acceso_vigente(), false) then
    raise exception 'Tu acceso a la Academia no está activo.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('arena:' || p_torneo::text, 0));

  select * into t from public.tournaments where id = p_torneo;
  if not found or t.format <> 'arena' then
    raise exception 'Ese torneo no es una arena.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.tournament_registrations r
                  where r.tournament_id = p_torneo and r.player_id = v_yo) then
    raise exception 'No estás en la lista de esta arena.' using errcode = '42501';
  end if;

  -- Ya tiene una partida en juego: a esa va, no a otra.
  select p.game_room_id into v_sala
    from public.tournament_pairings p
    join public.game_rooms g on g.id = p.game_room_id
   where p.tournament_id = p_torneo and (p.white_id = v_yo or p.black_id = v_yo)
     and g.status = 'playing'
   order by p.created_at desc
   limit 1;
  if v_sala is not null then
    delete from public.tournament_arena_cola c where c.tournament_id = p_torneo and c.player_id = v_yo;
    return jsonb_build_object('estado', 'jugando', 'sala', v_sala, 'modalidad', t.variant);
  end if;

  if t.status <> 'in_progress' or t.arena_termina is null or now() >= t.arena_termina then
    delete from public.tournament_arena_cola c where c.tournament_id = p_torneo and c.player_id = v_yo;
    return jsonb_build_object('estado', case when t.status = 'registration' then 'sin_empezar' else 'terminada' end);
  end if;

  -- Quien vuelve después de haberse ido empieza a esperar de nuevo: si no,
  -- pasaría por delante de todos con la espera de hace una hora.
  insert into public.tournament_arena_cola as c (tournament_id, player_id)
  values (p_torneo, v_yo)
  on conflict (tournament_id, player_id) do update
     set desde = case when c.visto < now() - interval '12 seconds' then now() else c.desde end,
         visto = now()
  returning c.desde into v_desde;

  select case when p.white_id = v_yo then p.black_id else p.white_id end into v_ultimo
    from public.tournament_pairings p
   where p.tournament_id = p_torneo and (p.white_id = v_yo or p.black_id = v_yo)
   order by p.created_at desc
   limit 1;

  select c.player_id into v_rival
    from public.tournament_arena_cola c
   where c.tournament_id = p_torneo and c.player_id <> v_yo
     and c.visto > now() - interval '12 seconds'
     and exists (select 1 from public.tournament_registrations r
                  where r.tournament_id = p_torneo and r.player_id = c.player_id)
     and (c.player_id is distinct from v_ultimo
          or v_desde <= now() - interval '10 seconds'
          or c.desde <= now() - interval '10 seconds')
   order by (c.player_id is not distinct from v_ultimo), c.desde
   limit 1;

  if v_rival is null then
    return jsonb_build_object('estado', 'esperando', 'esperan', (
      select count(*) from public.tournament_arena_cola c
       where c.tournament_id = p_torneo and c.player_id <> v_yo
         and c.visto > now() - interval '12 seconds'));
  end if;

  -- Los colores: blancas para quien lleva menos blancas que negras en esta
  -- arena; si van parejos, al azar.
  select coalesce(sum(case when p.white_id = v_yo then 1 else -1 end), 0) into v_dif_yo
    from public.tournament_pairings p
   where p.tournament_id = p_torneo and (p.white_id = v_yo or p.black_id = v_yo);
  select coalesce(sum(case when p.white_id = v_rival then 1 else -1 end), 0) into v_dif_rival
    from public.tournament_pairings p
   where p.tournament_id = p_torneo and (p.white_id = v_rival or p.black_id = v_rival);
  if v_dif_yo < v_dif_rival or (v_dif_yo = v_dif_rival and random() < 0.5) then
    v_blancas := v_yo; v_negras := v_rival;
  else
    v_blancas := v_rival; v_negras := v_yo;
  end if;

  -- La posición de salida. Donde es fija, la pone la base y lo que mande el
  -- navegador no cuenta; donde vive en el navegador, tiene que venir.
  if t.variant in ('estandar', 'niebla', 'volcanes', 'misiones') then
    v_fen := v_clasica;
  elsif t.variant in ('abrazos', 'camaleon', 'ciegas', 'vampiro') then
    v_fen := nullif(btrim(coalesce(p_fen, '')), '');
    if v_fen is null then
      raise exception 'Falta la posición de salida de la partida.' using errcode = '22023';
    end if;
  else
    v_fen := v_con_reserva;
  end if;
  if (t.variant = 'cartas' and p_cartas is null) or (t.variant = 'duelo' and p_duelo is null) then
    raise exception 'Falta la posición de salida de la partida.' using errcode = '22023';
  end if;

  -- La partida nace con los dos listos y el reloj andando: los dos estaban
  -- esperando, y una mesa que espera un «estoy listo» que no llega trabaría
  -- la arena de quien sí está.
  insert into public.game_rooms (
    variant, white_id, black_id, created_by,
    initial_seconds, increment_seconds, white_time_left, black_time_left,
    white_ready, black_ready, clock_updated_at,
    fen, cartas_state, duelo_state, variant_state
  ) values (
    t.variant, v_blancas, v_negras, coalesce(t.created_by, v_yo),
    t.initial_seconds, coalesce(t.increment_seconds, 0), t.initial_seconds, t.initial_seconds,
    true, true, now(),
    v_fen,
    case when t.variant = 'cartas' then p_cartas end,
    case when t.variant = 'duelo' then p_duelo end,
    case when t.variant in ('ciegas', 'volcanes') then p_variant end
  ) returning id into v_sala;

  select r.id into v_ronda from public.tournament_rounds r
   where r.tournament_id = p_torneo order by r.round_number limit 1;
  insert into public.tournament_pairings (round_id, tournament_id, board_number, white_id, black_id, is_bye, game_room_id)
  values (v_ronda, p_torneo,
          (select count(*) + 1 from public.tournament_pairings p where p.tournament_id = p_torneo),
          v_blancas, v_negras, false, v_sala);

  delete from public.tournament_arena_cola c
   where c.tournament_id = p_torneo and c.player_id in (v_yo, v_rival);

  return jsonb_build_object('estado', 'emparejado', 'sala', v_sala, 'modalidad', t.variant);
end;
$function$;
revoke execute on function public.arena_buscar(uuid, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.arena_buscar(uuid, text, jsonb, jsonb, jsonb) to authenticated;

-- «Ya no busco»: sale de la cola (solo la fila propia).
create function public.arena_salir(p_torneo uuid)
 returns void
 language sql
 security definer
 set search_path to ''
as $function$
  delete from public.tournament_arena_cola c
   where c.tournament_id = p_torneo and c.player_id = (select auth.uid());
$function$;
revoke execute on function public.arena_salir(uuid) from public, anon;
grant execute on function public.arena_salir(uuid) to authenticated;

-- El resultado de una partida de arena pasa a su cruce cuando la partida
-- termina, con la hora de la base. Solo las de arena: en los demás formatos
-- lo sigue escribiendo js/torneo-sync.js (en eliminación, unas tablas piden
-- una decisión de quien organiza).
create function interno.arena_anotar_resultado()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.result is null then
    return null;
  end if;
  update public.tournament_pairings p
     set result = new.result,
         finished_at = now(),
         jugadas = case when jsonb_typeof(new.moves) = 'array' then jsonb_array_length(new.moves) end
   where p.game_room_id = new.id and p.result is null
     and exists (select 1 from public.tournaments t where t.id = p.tournament_id and t.format = 'arena');
  return null;
end;
$function$;
revoke execute on function interno.arena_anotar_resultado() from public, anon, authenticated;
create trigger arena_anotar_resultado
  after update on public.game_rooms
  for each row
  when (new.status = 'finished' and old.status is distinct from 'finished')
  execute function interno.arena_anotar_resultado();

-- La clasificación. Corre con los permisos de quien llama: ve lo que la RLS
-- de los cruces y de los inscritos ya le deja ver. «En racha» es que la
-- partida de ahora vale el doble: ganó las dos anteriores.
create function public.arena_clasificacion(p_torneo uuid)
 returns table (player_id uuid, puntos integer, partidas integer, ganadas integer,
                tablas integer, perdidas integer, en_racha boolean)
 language sql
 stable
 set search_path to ''
as $function$
  with juegos as (
    select j.player_id, p.finished_at, p.created_at,
           case when p.result = 'draw' then 'd' when p.result = j.color then 'w' else 'l' end as r,
           (p.result = 'draw' and p.jugadas is not null and p.jugadas < 20) as rapidas
      from public.tournament_pairings p
     cross join lateral (values (p.white_id, 'white'), (p.black_id, 'black')) as j(player_id, color)
     where p.tournament_id = p_torneo and not p.is_bye and p.result is not null
       and j.player_id is not null
       -- Lo que terminó después de la hora no cuenta.
       and p.finished_at <= (select t.arena_termina from public.tournaments t
                              where t.id = p_torneo and t.format = 'arena')
  ),
  con_racha as (
    select j.*,
           coalesce((lag(j.r, 1) over w) = 'w' and (lag(j.r, 2) over w) = 'w', false) as doble,
           row_number() over (partition by j.player_id order by j.finished_at desc, j.created_at desc) as desde_el_final
      from juegos j
    window w as (partition by j.player_id order by j.finished_at, j.created_at)
  ),
  sumas as (
    select c.player_id,
           sum((case when c.r = 'w' then 2 when c.r = 'd' and not c.rapidas then 1 else 0 end)
               * (case when c.doble then 2 else 1 end))::integer as puntos,
           count(*)::integer as partidas,
           (count(*) filter (where c.r = 'w'))::integer as ganadas,
           (count(*) filter (where c.r = 'd'))::integer as tablas,
           (count(*) filter (where c.r = 'l'))::integer as perdidas,
           (count(*) filter (where c.desde_el_final <= 2 and c.r = 'w')) = 2 as en_racha
      from con_racha c
     group by c.player_id
  )
  select r.player_id, coalesce(s.puntos, 0), coalesce(s.partidas, 0), coalesce(s.ganadas, 0),
         coalesce(s.tablas, 0), coalesce(s.perdidas, 0), coalesce(s.en_racha, false)
    from public.tournament_registrations r
    left join sumas s on s.player_id = r.player_id
   where r.tournament_id = p_torneo
   order by coalesce(s.puntos, 0) desc, coalesce(s.ganadas, 0) desc, r.registered_at;
$function$;
revoke execute on function public.arena_clasificacion(uuid) from public, anon;
grant execute on function public.arena_clasificacion(uuid) to authenticated;

-- Cerrar la arena cuando se acabó el tiempo. Lo pide la pantalla de
-- cualquiera que participe; cierra uno solo. Con p_ahora, quien organiza la
-- termina antes. Gana quien más puntos hizo (si hay empate, todos los
-- empatados); si nadie hizo puntos, no hay campeón.
create function public.arena_cerrar(p_torneo uuid, p_ahora boolean default false)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_yo uuid := auth.uid();
  t public.tournaments;
  v_manda boolean;
  v_mejor integer;
  v_ganadores uuid[];
begin
  if v_yo is null then
    raise exception 'Hace falta entrar con tu cuenta.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('arena:' || p_torneo::text, 0));
  select * into t from public.tournaments where id = p_torneo for update;
  if not found or t.format <> 'arena' then
    raise exception 'Ese torneo no es una arena.' using errcode = '22023';
  end if;
  v_manda := coalesce(t.created_by = v_yo or (select m.is_admin from public.my_profile() m), false);
  if not coalesce(v_manda or exists (select 1 from public.tournament_registrations r
                                      where r.tournament_id = p_torneo and r.player_id = v_yo), false) then
    raise exception 'No participas en esta arena.' using errcode = '42501';
  end if;
  if t.status <> 'in_progress' then
    return false;
  end if;
  if coalesce(p_ahora, false) then
    if not v_manda then
      raise exception 'Solo quien organiza la arena puede terminarla antes de tiempo.' using errcode = '42501';
    end if;
    update public.tournaments set arena_termina = least(arena_termina, now())
     where id = p_torneo
    returning * into t;
  end if;
  if t.arena_termina is null or now() < t.arena_termina then
    return false;
  end if;

  select max(c.puntos) into v_mejor from public.arena_clasificacion(p_torneo) c;
  select coalesce(array_agg(c.player_id), '{}') into v_ganadores
    from public.arena_clasificacion(p_torneo) c
   where coalesce(v_mejor, 0) > 0 and c.puntos = v_mejor;

  update public.tournaments
     set status = 'finished', winner_ids = to_jsonb(v_ganadores),
         finished_at = t.arena_termina, updated_at = now()
   where id = p_torneo;
  update public.tournament_rounds set status = 'finished' where tournament_id = p_torneo;
  delete from public.tournament_arena_cola c where c.tournament_id = p_torneo;

  insert into public.public_tournament_champions (tournament_id, tournament_name, format, variant, display_name)
  select p_torneo, t.name, t.format, t.variant, coalesce(nullif(btrim(pr.full_name), ''), 'Alumno')
    from unnest(v_ganadores) as g(id)
    join public.profiles pr on pr.id = g.id;
  return true;
end;
$function$;
revoke execute on function public.arena_cerrar(uuid, boolean) from public, anon;
grant execute on function public.arena_cerrar(uuid, boolean) to authenticated;
