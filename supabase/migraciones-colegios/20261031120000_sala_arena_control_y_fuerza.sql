-- La sala de arena, segunda parte (continúa 20261029120000_sala_arena.sql).
--
-- 1. CONTROL EN VIVO. Quien administra puede pausar una arena, cerrarla antes
--    de tiempo, sacar a un jugador de ella y anular una partida. Todo eso lo
--    escribe la Edge Function `arena-admin` con la service role; la base solo
--    pone las columnas y respeta lo que dicen:
--      · `pausada`: nadie se empareja, pero las partidas en juego siguen y
--        quien espera se queda en la cola (arena_entrar devuelve null).
--      · `cerrada_en`: el fin de la arena pasa a ser el menor entre esa hora y
--        inicia + minutos. Las partidas que ya empezaron terminan.
--      · `arena_fuera`: quien está ahí no puede entrar a ESA arena.
--      · `arena_abortar()`: una partida EN JUEGO se cancela sin resultado ni
--        puntos (la usa arena-admin al sacar a alguien o al cancelar una).
--    Anular una partida TERMINADA ya existe (`anulada`, del juego limpio); acá
--    solo se le agrega que devuelva la fuerza que esa partida había movido.
--
-- 2. LA FUERZA. Cada jugador tiene una `fuerza` (Elo, 1000 al empezar, que
--    administración puede fijar) que se actualiza al terminar cada partida
--    (K = 32, suma cero). Sirve para EMPAREJAR: entre los rivales de otro
--    equipo se prefiere al más parecido, y a quien espera mucho se le va
--    aflojando el criterio (150 puntos de diferencia más 40 por cada segundo
--    de espera) para que nadie se quede sin partida. No se muestra: el permiso
--    por columna de arena_jugadores no la incluye. Unas tablas de menos de 20
--    jugadas no la mueven (igual que no dan puntos).
--
-- 3. LA JUGADA LA VALIDA EL SERVIDOR. Antes el navegador decía «mi jugada es
--    esta, la posición queda así y con ella se acabó la partida»; la base
--    comprobaba el turno, el reloj y la forma del FEN pero no si la jugada era
--    legal ni si era mate. Ahora las jugadas pasan por la Edge Function
--    `arena-jugar`, que repite la partida con chess.js, comprueba que la jugada
--    sea legal y calcula ella misma el SAN, el FEN y si hubo mate, ahogado,
--    repetición… y recién entonces llama a `arena_aplicar_jugada()`. Esta es
--    la antigua `arena_mover` pero recibe a QUIEN juega como argumento y solo
--    la puede ejecutar la service role (y conserva el tiempo `ms` de cada
--    jugada que agregó el juego limpio); `arena_mover` se borra, así que nadie
--    puede saltarse la validación llamando a la base directamente. El juego
--    limpio sigue sirviendo para lo que no depende de la legalidad: las salidas
--    de la pantalla y los tiempos parejos.

alter table public.arena_torneos
  add column pausada boolean not null default false,
  add column cerrada_en timestamptz;

alter table public.arena_jugadores
  add column fuerza integer not null default 1000 check (fuerza between 100 and 3500);

-- Cuánto movió esta partida la fuerza de cada uno (para devolverla si se anula).
alter table public.arena_partidas
  add column cambio_blancas integer not null default 0,
  add column cambio_negras integer not null default 0;

create table public.arena_fuera (
  torneo_id uuid not null references public.arena_torneos(id) on delete cascade,
  jugador_id uuid not null references public.arena_jugadores(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (torneo_id, jugador_id)
);
alter table public.arena_fuera enable row level security;
-- Sin políticas a propósito: solo la service role y las funciones la leen.
revoke all on public.arena_fuera from anon, authenticated;

comment on table public.arena_fuera is
  'Jugadores que administración sacó de una arena. No se lee desde el navegador.';

-- ------------------------------------------------------------ cerrar partidas
-- Igual que antes, más la fuerza: Elo con K = 32 entre los dos.
create or replace function public.arena_cerrar(p_partida uuid, p_resultado text, p_motivo text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  p public.arena_partidas%rowtype;
  n integer;
  pb integer;
  pn integer;
  fb integer;
  fn integer;
  esperado numeric;
  logrado numeric;
  db integer := 0;
begin
  select * into p from public.arena_partidas where id = p_partida for update;
  if not found or p.estado <> 'en_juego' then return; end if;
  n := jsonb_array_length(p.jugadas);

  if n < 2 and p_motivo in ('tiempo', 'abandono') then
    update public.arena_partidas
       set estado = 'terminada', resultado = null, motivo = 'abortada',
           terminada_en = clock_timestamp(), oferta_tablas = null
     where id = p.id;
    return;
  end if;

  pb := public.arena_puntos(p.torneo_id, p.blancas,
          case p_resultado when '1-0' then 'g' when '0-1' then 'p' else 'e' end, n);
  pn := public.arena_puntos(p.torneo_id, p.negras,
          case p_resultado when '0-1' then 'g' when '1-0' then 'p' else 'e' end, n);

  -- La fuerza: unas tablas cortas no la mueven (tampoco dan puntos).
  if not (p_resultado = '1/2-1/2' and n < 20) then
    select fuerza into fb from public.arena_jugadores where id = p.blancas;
    select fuerza into fn from public.arena_jugadores where id = p.negras;
    esperado := 1 / (1 + power(10, (fn - fb) / 400.0));
    logrado := case p_resultado when '1-0' then 1 when '0-1' then 0 else 0.5 end;
    db := round(32 * (logrado - esperado));
    update public.arena_jugadores set fuerza = greatest(100, least(3500, fuerza + db)) where id = p.blancas;
    update public.arena_jugadores set fuerza = greatest(100, least(3500, fuerza - db)) where id = p.negras;
  end if;

  update public.arena_partidas
     set estado = 'terminada', resultado = p_resultado, motivo = p_motivo,
         puntos_blancas = pb, puntos_negras = pn,
         cambio_blancas = db, cambio_negras = -db,
         terminada_en = clock_timestamp(), oferta_tablas = null
   where id = p.id;
end;
$function$;

-- Cancelar una partida EN JUEGO: sin resultado ni puntos ni cambio de fuerza
-- (solo la service role, desde arena-admin). Es lo mismo que cuando nadie llega
-- a mover: «abortada».
create or replace function public.arena_abortar(p_partida uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  update public.arena_partidas
     set estado = 'terminada', resultado = null, motivo = 'abortada',
         terminada_en = clock_timestamp(), oferta_tablas = null
   where id = p_partida and estado = 'en_juego';
end;
$function$;

-- Anular una partida terminada (la marca `anulada` del juego limpio) devuelve
-- la fuerza que había movido; devolverla a la clasificación la vuelve a mover.
create or replace function public.arena_fuerza_al_anular()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  signo integer;
begin
  if new.anulada is not distinct from old.anulada then return new; end if;
  signo := case when new.anulada then -1 else 1 end;
  update public.arena_jugadores set fuerza = greatest(100, least(3500, fuerza + signo * new.cambio_blancas)) where id = new.blancas;
  update public.arena_jugadores set fuerza = greatest(100, least(3500, fuerza + signo * new.cambio_negras)) where id = new.negras;
  return new;
end;
$function$;

create trigger arena_fuerza_al_anular
  after update of anulada on public.arena_partidas
  for each row execute function public.arena_fuerza_al_anular();

-- --------------------------------------------------------- el emparejamiento
-- Como antes, más: la pausa, el cierre anticipado, quien está fuera y la
-- fuerza (entre los candidatos, el más parecido; y no se junta a dos muy
-- distintos mientras haya tiempo de esperar a alguien mejor). Y ahora una
-- regla, no una preferencia: en una arena por equipos dos del MISMO equipo no
-- se enfrentan nunca, por mucho que esperen (antes se aflojaba a los 10 s).
-- Quien se queda sin rival posible espera a que llegue alguien de otro equipo.
create or replace function public.arena_emparejar(p_torneo uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  t public.arena_torneos%rowtype;
  fin timestamptz;
  c record;
  r record;
  ultimo uuid;
  dc integer;
  dr integer;
  espera numeric;
  blancas uuid;
  negras uuid;
begin
  select * into t from public.arena_torneos where id = p_torneo;
  if not found then return; end if;
  fin := least(t.inicia + make_interval(mins => t.minutos), coalesce(t.cerrada_en, 'infinity'::timestamptz));
  if clock_timestamp() < t.inicia or clock_timestamp() >= fin then
    delete from public.arena_cola where torneo_id = p_torneo;
    return;
  end if;
  -- En pausa nadie se empareja; quien espera se queda esperando.
  if t.pausada then return; end if;

  perform pg_advisory_xact_lock(hashtextextended('arena:' || p_torneo::text, 0));
  delete from public.arena_cola
   where torneo_id = p_torneo and visto < clock_timestamp() - interval '2 minutes';

  for c in
    select q.jugador_id, q.desde, j.equipo_id, j.fuerza
    from public.arena_cola q
    join public.arena_jugadores j on j.id = q.jugador_id
    where q.torneo_id = p_torneo
      and q.visto > clock_timestamp() - interval '12 seconds'
      and not exists (select 1 from public.arena_fuera f where f.torneo_id = p_torneo and f.jugador_id = q.jugador_id)
      and not exists (select 1 from public.arena_partidas a
                       where a.estado = 'en_juego' and q.jugador_id in (a.blancas, a.negras))
    order by q.desde
  loop
    continue when not exists (
      select 1 from public.arena_cola where torneo_id = p_torneo and jugador_id = c.jugador_id);

    select case when a.blancas = c.jugador_id then a.negras else a.blancas end into ultimo
      from public.arena_partidas a
     where a.torneo_id = p_torneo and c.jugador_id in (a.blancas, a.negras)
     order by a.creada_en desc
     limit 1;

    select q.jugador_id, q.desde, j.equipo_id, j.fuerza into r
    from public.arena_cola q
    join public.arena_jugadores j on j.id = q.jugador_id
    where q.torneo_id = p_torneo
      and q.jugador_id <> c.jugador_id
      -- En una arena por equipos NUNCA se enfrentan dos del mismo equipo.
      and not (t.por_equipos and j.equipo_id is not distinct from c.equipo_id)
      and q.visto > clock_timestamp() - interval '12 seconds'
      and not exists (select 1 from public.arena_fuera f where f.torneo_id = p_torneo and f.jugador_id = q.jugador_id)
      and not exists (select 1 from public.arena_partidas a
                       where a.estado = 'en_juego' and q.jugador_id in (a.blancas, a.negras))
    order by (q.jugador_id is not distinct from ultimo),
             abs(j.fuerza - c.fuerza),
             q.desde
    limit 1;
    continue when not found;

    espera := extract(epoch from (clock_timestamp() - c.desde));

    -- La revancha inmediata solo si ya esperó 10 segundos.
    if r.jugador_id is not distinct from ultimo and espera < 10 then
      continue;
    end if;
    -- Muy distintos: se espera a alguien más parecido, cada vez menos.
    if abs(r.fuerza - c.fuerza) > 150 + 40 * espera then
      continue;
    end if;

    select count(*) filter (where a.blancas = c.jugador_id) - count(*) filter (where a.negras = c.jugador_id)
      into dc from public.arena_partidas a
     where a.torneo_id = p_torneo and c.jugador_id in (a.blancas, a.negras);
    select count(*) filter (where a.blancas = r.jugador_id) - count(*) filter (where a.negras = r.jugador_id)
      into dr from public.arena_partidas a
     where a.torneo_id = p_torneo and r.jugador_id in (a.blancas, a.negras);

    if dc < dr or (dc = dr and random() < 0.5) then
      blancas := c.jugador_id; negras := r.jugador_id;
    else
      blancas := r.jugador_id; negras := c.jugador_id;
    end if;

    insert into public.arena_partidas (torneo_id, blancas, negras, ms_blancas, ms_negras)
    values (p_torneo, blancas, negras, t.inicial_seg * 1000, t.inicial_seg * 1000);

    delete from public.arena_cola
     where torneo_id = p_torneo and jugador_id in (blancas, negras);
  end loop;
end;
$function$;

create or replace function public.arena_entrar(p_torneo uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  yo uuid := (select auth.uid());
  j public.arena_jugadores%rowtype;
  t public.arena_torneos%rowtype;
  fin timestamptz;
  activa uuid;
begin
  if yo is null or not coalesce(public.soy_jugador_de_sala(), false) then
    raise exception 'Hace falta entrar a la sala con tu usuario y tu clave.' using errcode = '42501';
  end if;
  select * into j from public.arena_jugadores where id = yo;
  select * into t from public.arena_torneos where id = p_torneo;
  if not found then raise exception 'Esa arena no existe.'; end if;

  -- Si ya tiene una partida en juego, esa es: se reconecta a ella.
  select a.id into activa from public.arena_partidas a
   where a.estado = 'en_juego' and yo in (a.blancas, a.negras)
   order by a.creada_en desc limit 1;
  if activa is not null and public.arena_vencer(activa) then activa := null; end if;
  if activa is not null then return activa; end if;

  fin := least(t.inicia + make_interval(mins => t.minutos), coalesce(t.cerrada_en, 'infinity'::timestamptz));
  if clock_timestamp() < t.inicia then raise exception 'La arena todavía no empieza.'; end if;
  if clock_timestamp() >= fin then raise exception 'La arena ya terminó.'; end if;
  if exists (select 1 from public.arena_fuera f where f.torneo_id = p_torneo and f.jugador_id = yo) then
    delete from public.arena_cola where jugador_id = yo and torneo_id = p_torneo;
    raise exception 'Tu profe te sacó de esta arena.';
  end if;
  if t.por_equipos and j.equipo_id is null then
    raise exception 'Todavía no estás en un equipo. Avísale a tu profe.';
  end if;

  delete from public.arena_cola where jugador_id = yo and torneo_id <> p_torneo;
  insert into public.arena_cola (torneo_id, jugador_id, desde, visto)
  values (p_torneo, yo, clock_timestamp(), clock_timestamp())
  on conflict (torneo_id, jugador_id) do update set visto = clock_timestamp();

  -- En pausa se queda esperando, sin error: la pantalla lo dice.
  if not t.pausada then
    perform public.arena_emparejar(p_torneo);
  end if;

  select a.id into activa from public.arena_partidas a
   where a.estado = 'en_juego' and yo in (a.blancas, a.negras)
   order by a.creada_en desc limit 1;
  return activa;
end;
$function$;

-- ----------------------------------------------------------------- las jugadas
-- La jugada ya validada por arena-jugar. Es la antigua arena_mover, pero quien
-- juega viene como argumento (la Edge Function lo sacó del token) y solo la
-- puede ejecutar la service role.
create or replace function public.arena_aplicar_jugada(
  p_jugador uuid, p_partida uuid, p_desde text, p_hasta text, p_san text, p_fen text, p_fin text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  p public.arena_partidas%rowtype;
  t public.arena_torneos%rowtype;
  color text;
  usado bigint;
  resta bigint;
  nuevo bigint;
  n integer;
begin
  if p_jugador is null or not exists (select 1 from public.arena_jugadores j where j.id = p_jugador) then
    raise exception 'Hace falta entrar a la sala con tu usuario y tu clave.' using errcode = '42501';
  end if;
  select * into p from public.arena_partidas where id = p_partida for update;
  if not found then raise exception 'Esa partida no existe.'; end if;
  if p.estado <> 'en_juego' then return to_jsonb(p); end if;

  color := case p_jugador when p.blancas then 'w' when p.negras then 'b' else null end;
  if color is null then raise exception 'No juegas en esta partida.' using errcode = '42501'; end if;
  if split_part(p.fen, ' ', 2) <> color then raise exception 'Todavía no es tu turno.'; end if;

  if public.arena_vencer(p.id) then
    select * into p from public.arena_partidas where id = p_partida;
    return to_jsonb(p);
  end if;

  if p_desde !~ '^[a-h][1-8]$' or p_hasta !~ '^[a-h][1-8]$'
     or p_san is null or length(p_san) not between 2 and 12
     or p_fen is null or length(p_fen) > 100
     or p_fen !~ '^[pnbrqkPNBRQK1-8/]+ [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) [0-9]+ [0-9]+$'
     or split_part(p_fen, ' ', 2) = color
     or length(regexp_replace(split_part(p_fen, ' ', 1), '[^K]', '', 'g')) <> 1
     or length(regexp_replace(split_part(p_fen, ' ', 1), '[^k]', '', 'g')) <> 1
     or p_fin is not null and p_fin not in ('mate', 'ahogado', 'material', 'repeticion', 'cincuenta') then
    raise exception 'Esa jugada no es válida.';
  end if;

  n := jsonb_array_length(p.jugadas);
  if n >= 600 then raise exception 'La partida llegó al tope de jugadas.'; end if;

  select * into t from public.arena_torneos where id = p.torneo_id;
  usado := floor(extract(epoch from (clock_timestamp() - p.reloj_desde)) * 1000);
  resta := (case color when 'w' then p.ms_blancas else p.ms_negras end) - usado;
  nuevo := least(resta + t.incremento_seg * 1000, 2147483000);

  update public.arena_partidas
     set fen = p_fen,
         jugadas = p.jugadas || jsonb_build_array(jsonb_build_object('s', p_san, 'f', p_desde, 't', p_hasta, 'ms', least(greatest(usado, 0), 2147483000))),
         ms_blancas = case when color = 'w' then nuevo else p.ms_blancas end,
         ms_negras = case when color = 'b' then nuevo else p.ms_negras end,
         reloj_desde = clock_timestamp(),
         oferta_tablas = null
   where id = p.id;

  if p_fin = 'mate' then
    perform public.arena_cerrar(p.id, case color when 'w' then '1-0' else '0-1' end, 'mate');
  elsif p_fin is not null then
    perform public.arena_cerrar(p.id, '1/2-1/2', p_fin);
  end if;

  select * into p from public.arena_partidas where id = p_partida;
  return to_jsonb(p);
end;
$function$;

-- Nadie llama a la base para mover: pasa por arena-jugar.
drop function public.arena_mover(uuid, text, text, text, text, text);

-- ---------------------------------------------------------------- ejecutar
revoke execute on function public.arena_abortar(uuid) from public, anon, authenticated;
revoke execute on function public.arena_fuerza_al_anular() from public, anon, authenticated;
revoke execute on function public.arena_aplicar_jugada(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.arena_abortar(uuid) to service_role;
grant execute on function public.arena_aplicar_jugada(uuid, uuid, text, text, text, text, text) to service_role;
