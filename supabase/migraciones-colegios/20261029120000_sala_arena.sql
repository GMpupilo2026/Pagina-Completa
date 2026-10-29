-- La sala de arena: torneos "arena" entre equipos, en una sala APARTE de la Academia.
--
-- APLICADA A MANO el 29/10/2026 en el SQL Editor de «Base de Colegios»: la
-- herramienta de migraciones de Supabase pidió una confirmación al dueño que
-- nadie pudo contestar a tiempo. El SQL que se pegó es este, con un encabezado
-- de comentarios más corto; después se comprobó con pruebas (emparejar, mover,
-- puntos, permisos) dentro de una transacción que se deshizo.
--
-- Vive en "Base de Colegios" a propósito. Sus jugadores NO son cuentas de la
-- Academia: son estudiantes que salen de las inscripciones a los torneos en
-- línea, a quienes administración les da un usuario y una clave. Así no se
-- mezclan con las academias (privadas entre sí) y los datos de los menores no
-- cruzan de proyecto.
--
-- MODELO DE CONFIANZA (igual al de game_rooms en la Academia, dicho acá para
-- que no se lea como un descuido): la base decide de quién es el turno, cuánto
-- reloj le queda a cada quien, quién puede mover, los puntos, el emparejamiento
-- y la bandera. Lo que la base NO puede decidir —porque no tiene motor de
-- ajedrez— es si una jugada es legal y si una posición es mate: eso lo manda el
-- navegador de quien mueve (chess.js). Cuidado con esa frontera si alguna vez
-- hay premios de verdad: el siguiente paso sería validar la jugada en una Edge
-- Function que repita la partida.
--
-- NADIE ESCRIBE ESTAS TABLAS DESDE EL NAVEGADOR. No hay políticas de escritura:
-- las escriben las funciones de abajo (SECURITY DEFINER) y la Edge Function
-- `arena-admin` (service role), que arma equipos y cuentas.
--
-- PUNTOS: igual que en una arena de Lichess. Victoria 2, tablas 1, derrota 0.
-- Con dos victorias seguidas se está "en racha" y la partida siguiente vale el
-- doble (también las tablas). Unas tablas de menos de 20 jugadas no dan puntos,
-- y una partida en que no se llegó a mover nadie no cuenta (se aborta).
-- POR EQUIPOS: el equipo suma los puntos de sus `mejores` jugadores.
--
-- Los puntos de cada partida SÍ se guardan (son el acta: dependen de la racha
-- que tenía cada quien en ese momento, que no se puede reconstruir barato).
-- Todo lo demás —la clasificación, quién va en racha— se calcula.

-- ------------------------------------------------------------------ tablas
create table public.arena_equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 60),
  creado_en timestamptz not null default now()
);
create unique index arena_equipos_nombre_unico on public.arena_equipos (lower(btrim(nombre)));

create table public.arena_jugadores (
  id uuid primary key references auth.users(id) on delete cascade,
  usuario text not null check (usuario ~ '^[A-Za-z0-9_.-]{3,60}$'),
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  equipo_id uuid references public.arena_equipos(id) on delete set null,
  inscripcion_id uuid references public.inscripciones(id) on delete set null,
  creado_en timestamptz not null default now()
);
create unique index arena_jugadores_usuario_unico on public.arena_jugadores (lower(usuario));
create unique index arena_jugadores_inscripcion_unica on public.arena_jugadores (inscripcion_id)
  where inscripcion_id is not null;
create index arena_jugadores_equipo_idx on public.arena_jugadores (equipo_id);

create table public.arena_torneos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 100),
  inicia timestamptz not null,
  minutos integer not null check (minutos between 10 and 240),
  inicial_seg integer not null check (inicial_seg between 30 and 1800),
  incremento_seg integer not null default 0 check (incremento_seg between 0 and 30),
  por_equipos boolean not null default true,
  mejores integer not null default 5 check (mejores between 1 and 20),
  creado_en timestamptz not null default now()
);

create table public.arena_cola (
  torneo_id uuid not null references public.arena_torneos(id) on delete cascade,
  jugador_id uuid not null references public.arena_jugadores(id) on delete cascade,
  desde timestamptz not null default clock_timestamp(),
  visto timestamptz not null default clock_timestamp(),
  primary key (torneo_id, jugador_id)
);
create index arena_cola_jugador_idx on public.arena_cola (jugador_id);

create table public.arena_partidas (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references public.arena_torneos(id) on delete cascade,
  blancas uuid not null references public.arena_jugadores(id) on delete cascade,
  negras uuid not null references public.arena_jugadores(id) on delete cascade,
  fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  -- [{"s":"e4","f":"e2","t":"e4"}, ...]: la jugada en SAN y de dónde a dónde
  jugadas jsonb not null default '[]'::jsonb check (jsonb_typeof(jugadas) = 'array'),
  ms_blancas integer not null,
  ms_negras integer not null,
  -- desde cuándo corre el reloj de quien tiene el turno (hora de la base)
  reloj_desde timestamptz not null default clock_timestamp(),
  estado text not null default 'en_juego' check (estado in ('en_juego', 'terminada')),
  resultado text check (resultado in ('1-0', '0-1', '1/2-1/2')),
  motivo text,
  oferta_tablas text check (oferta_tablas in ('w', 'b')),
  puntos_blancas integer not null default 0,
  puntos_negras integer not null default 0,
  creada_en timestamptz not null default clock_timestamp(),
  terminada_en timestamptz,
  check (blancas <> negras)
);
create index arena_partidas_torneo_idx on public.arena_partidas (torneo_id, estado);
create index arena_partidas_blancas_idx on public.arena_partidas (blancas, estado);
create index arena_partidas_negras_idx on public.arena_partidas (negras, estado);
-- Nadie juega dos partidas a la vez con el mismo color: lo garantiza un índice
-- único, no un `if` (el cruce blancas/negras lo cuida arena_entrar).
create unique index arena_partidas_una_activa_blancas on public.arena_partidas (blancas) where estado = 'en_juego';
create unique index arena_partidas_una_activa_negras on public.arena_partidas (negras) where estado = 'en_juego';

comment on table public.arena_jugadores is
  'Jugadores de la sala de arena: estudiantes de las inscripciones a quienes administración les dio usuario y clave. NO son cuentas de la Academia.';
comment on table public.arena_partidas is
  'Partidas de las arenas. La base lleva el turno, el reloj, los puntos y el emparejamiento; la legalidad de la jugada la manda el navegador (ver el encabezado de la migración).';

-- ----------------------------------------------------------------- permisos
alter table public.arena_equipos enable row level security;
alter table public.arena_jugadores enable row level security;
alter table public.arena_torneos enable row level security;
alter table public.arena_cola enable row level security;
alter table public.arena_partidas enable row level security;

-- ¿Quien llama es un jugador de la sala? Una cuenta cualquiera de este proyecto
-- (el registro público de Auth puede estar abierto) NO lo es.
create or replace function public.soy_jugador_de_sala()
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select exists (select 1 from public.arena_jugadores j where j.id = (select auth.uid()))
$function$;

revoke execute on function public.soy_jugador_de_sala() from public, anon;
grant execute on function public.soy_jugador_de_sala() to authenticated, service_role;

create policy arena_equipos_select on public.arena_equipos for select to authenticated
  using ((select public.soy_jugador_de_sala()));
create policy arena_jugadores_select on public.arena_jugadores for select to authenticated
  using ((select public.soy_jugador_de_sala()));
create policy arena_torneos_select on public.arena_torneos for select to authenticated
  using ((select public.soy_jugador_de_sala()));
create policy arena_partidas_select on public.arena_partidas for select to authenticated
  using ((select public.soy_jugador_de_sala()));
create policy arena_cola_select on public.arena_cola for select to authenticated
  using (jugador_id = (select auth.uid()));

-- Solo lectura para quien juega, y sin ver el usuario ni la inscripción de los
-- demás: el usuario es medio inicio de sesión de cada niño.
revoke all on public.arena_equipos, public.arena_jugadores, public.arena_torneos,
  public.arena_cola, public.arena_partidas from anon, authenticated;
grant select on public.arena_equipos, public.arena_torneos, public.arena_cola, public.arena_partidas to authenticated;
grant select (id, nombre, equipo_id) on public.arena_jugadores to authenticated;

-- Las jugadas del rival llegan solas, por Realtime.
alter publication supabase_realtime add table public.arena_partidas;

-- --------------------------------------------------------------- la hora
-- La misma que usa la Academia: el reloj de cada quien se cuenta con la hora de
-- la base, no con la de la computadora (js/reloj-servidor.js).
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

-- -------------------------------------------------------- puntos y cierres
-- Puntos de UNA partida para UN jugador. p_res: 'g' ganó, 'e' empató, 'p' perdió.
create or replace function public.arena_puntos(p_torneo uuid, p_jugador uuid, p_res text, p_jugadas integer)
 returns integer
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  racha integer := 0;
  r record;
  base integer;
begin
  -- Las dos últimas partidas terminadas: si ganó las dos, va en racha.
  for r in
    select ((p.blancas = p_jugador and p.resultado = '1-0') or (p.negras = p_jugador and p.resultado = '0-1')) as gano
    from public.arena_partidas p
    where p.torneo_id = p_torneo and p.estado = 'terminada' and p.resultado is not null
      and p_jugador in (p.blancas, p.negras)
    order by p.terminada_en desc
    limit 2
  loop
    if r.gano then racha := racha + 1; else exit; end if;
  end loop;

  base := case p_res when 'g' then 2 when 'e' then 1 else 0 end;
  -- Unas tablas de menos de 20 jugadas no dan nada: es la forma de que no se
  -- pongan de acuerdo en regalarse puntos.
  if p_res = 'e' and p_jugadas < 20 then base := 0; end if;
  if racha >= 2 and p_res <> 'p' then base := base * 2; end if;
  return base;
end;
$function$;

-- Cierra una partida y reparte los puntos. Una partida donde no se llegó a
-- jugar (menos de dos jugadas) por tiempo o abandono se aborta: sin resultado.
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

  update public.arena_partidas
     set estado = 'terminada', resultado = p_resultado, motivo = p_motivo,
         puntos_blancas = pb, puntos_negras = pn,
         terminada_en = clock_timestamp(), oferta_tablas = null
   where id = p.id;
end;
$function$;

-- Si a quien tiene el turno se le acabó el reloj, pierde por tiempo. En las dos
-- primeras jugadas el plazo es de 30 segundos (o lo que tenga de reloj, si es
-- menos): quien no llegó a mover no le retiene la partida a su rival. Devuelve
-- si cerró la partida.
create or replace function public.arena_vencer(p_partida uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  p public.arena_partidas%rowtype;
  n integer;
  turno text;
  usado bigint;
  reloj integer;
  resta bigint;
begin
  select * into p from public.arena_partidas where id = p_partida for update;
  if not found or p.estado <> 'en_juego' then return false; end if;
  n := jsonb_array_length(p.jugadas);
  turno := split_part(p.fen, ' ', 2);
  usado := floor(extract(epoch from (clock_timestamp() - p.reloj_desde)) * 1000);
  reloj := case turno when 'w' then p.ms_blancas else p.ms_negras end;
  resta := (case when n < 2 then least(30000, reloj) else reloj end) - usado;
  if resta > 0 then return false; end if;
  perform public.arena_cerrar(p.id, case turno when 'w' then '0-1' else '1-0' end, 'tiempo');
  return true;
end;
$function$;

-- ------------------------------------------------------- el emparejamiento
-- Empareja a quienes esperan, de a dos, apenas se puede. Prefiere un rival de
-- OTRO equipo y distinto del último contra el que se jugó; solo cuando no hay
-- de otra, y quien espera lleva ya 10 segundos, acepta uno del mismo equipo o
-- una revancha. Los colores se reparten para que nadie juegue siempre con uno.
create or replace function public.arena_emparejar(p_torneo uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  t public.arena_torneos%rowtype;
  c record;
  r record;
  ultimo uuid;
  dc integer;
  dr integer;
  blancas uuid;
  negras uuid;
begin
  select * into t from public.arena_torneos where id = p_torneo;
  if not found then return; end if;
  if clock_timestamp() < t.inicia or clock_timestamp() >= t.inicia + make_interval(mins => t.minutos) then
    delete from public.arena_cola where torneo_id = p_torneo;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('arena:' || p_torneo::text, 0));
  -- Quien cerró la pestaña no se queda en la cola para siempre.
  delete from public.arena_cola
   where torneo_id = p_torneo and visto < clock_timestamp() - interval '2 minutes';

  for c in
    select q.jugador_id, q.desde, j.equipo_id
    from public.arena_cola q
    join public.arena_jugadores j on j.id = q.jugador_id
    where q.torneo_id = p_torneo
      and q.visto > clock_timestamp() - interval '12 seconds'
      and not exists (select 1 from public.arena_partidas a
                       where a.estado = 'en_juego' and q.jugador_id in (a.blancas, a.negras))
    order by q.desde
  loop
    -- ya quedó emparejado en esta misma vuelta
    continue when not exists (
      select 1 from public.arena_cola where torneo_id = p_torneo and jugador_id = c.jugador_id);

    select case when a.blancas = c.jugador_id then a.negras else a.blancas end into ultimo
      from public.arena_partidas a
     where a.torneo_id = p_torneo and c.jugador_id in (a.blancas, a.negras)
     order by a.creada_en desc
     limit 1;

    select q.jugador_id, q.desde, j.equipo_id into r
    from public.arena_cola q
    join public.arena_jugadores j on j.id = q.jugador_id
    where q.torneo_id = p_torneo
      and q.jugador_id <> c.jugador_id
      and q.visto > clock_timestamp() - interval '12 seconds'
      and not exists (select 1 from public.arena_partidas a
                       where a.estado = 'en_juego' and q.jugador_id in (a.blancas, a.negras))
    order by (t.por_equipos and j.equipo_id is not distinct from c.equipo_id),
             (q.jugador_id is not distinct from ultimo),
             q.desde
    limit 1;
    continue when not found;

    if ((t.por_equipos and r.equipo_id is not distinct from c.equipo_id) or r.jugador_id is not distinct from ultimo)
       and clock_timestamp() - c.desde < interval '10 seconds' then
      continue;
    end if;

    -- blancas: quien ha jugado menos con ellas
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

-- ------------------------------------------------ lo que llama el navegador
-- Entrar a jugar (o seguir en la cola: se llama cada pocos segundos, y es el
-- "sigo aquí"). Devuelve la partida en que está, si ya le tocó una.
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
  activa uuid;
begin
  if yo is null or not coalesce(public.soy_jugador_de_sala(), false) then
    raise exception 'Hace falta entrar a la sala con tu usuario y tu clave.' using errcode = '42501';
  end if;
  select * into j from public.arena_jugadores where id = yo;
  select * into t from public.arena_torneos where id = p_torneo;
  if not found then raise exception 'Esa arena no existe.'; end if;

  -- Si ya tiene una partida en juego, esa es: se reconecta a ella. Una que se
  -- quedó sin terminar porque nadie movió ya no cuenta.
  select a.id into activa from public.arena_partidas a
   where a.estado = 'en_juego' and yo in (a.blancas, a.negras)
   order by a.creada_en desc limit 1;
  if activa is not null and public.arena_vencer(activa) then activa := null; end if;
  if activa is not null then return activa; end if;

  if clock_timestamp() < t.inicia then raise exception 'La arena todavía no empieza.'; end if;
  if clock_timestamp() >= t.inicia + make_interval(mins => t.minutos) then
    raise exception 'La arena ya terminó.';
  end if;
  if t.por_equipos and j.equipo_id is null then
    raise exception 'Todavía no estás en un equipo. Avísale a tu profe.';
  end if;

  delete from public.arena_cola where jugador_id = yo and torneo_id <> p_torneo;
  insert into public.arena_cola (torneo_id, jugador_id, desde, visto)
  values (p_torneo, yo, clock_timestamp(), clock_timestamp())
  on conflict (torneo_id, jugador_id) do update set visto = clock_timestamp();

  perform public.arena_emparejar(p_torneo);

  select a.id into activa from public.arena_partidas a
   where a.estado = 'en_juego' and yo in (a.blancas, a.negras)
   order by a.creada_en desc limit 1;
  return activa;
end;
$function$;

create or replace function public.arena_salir(p_torneo uuid)
 returns void
 language sql
 security definer
 set search_path to ''
as $function$
  delete from public.arena_cola where torneo_id = p_torneo and jugador_id = (select auth.uid())
$function$;

-- Una jugada. El navegador manda la posición nueva (FEN) y, si con ella se
-- acabó la partida, `p_fin`: mate, ahogado, material, repeticion o cincuenta.
create or replace function public.arena_mover(
  p_partida uuid, p_desde text, p_hasta text, p_san text, p_fen text, p_fin text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  yo uuid := (select auth.uid());
  p public.arena_partidas%rowtype;
  t public.arena_torneos%rowtype;
  color text;
  usado bigint;
  resta bigint;
  nuevo bigint;
  n integer;
begin
  if yo is null or not coalesce(public.soy_jugador_de_sala(), false) then
    raise exception 'Hace falta entrar a la sala con tu usuario y tu clave.' using errcode = '42501';
  end if;
  select * into p from public.arena_partidas where id = p_partida for update;
  if not found then raise exception 'Esa partida no existe.'; end if;
  if p.estado <> 'en_juego' then return to_jsonb(p); end if;

  color := case yo when p.blancas then 'w' when p.negras then 'b' else null end;
  if color is null then raise exception 'No juegas en esta partida.' using errcode = '42501'; end if;
  if split_part(p.fen, ' ', 2) <> color then raise exception 'Todavía no es tu turno.'; end if;

  -- Si se le acabó el tiempo, la jugada llegó tarde: pierde por tiempo.
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
         jugadas = p.jugadas || jsonb_build_array(jsonb_build_object('s', p_san, 'f', p_desde, 't', p_hasta)),
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

-- Cualquiera de los dos la llama cuando ve que el reloj de quien tiene el turno
-- llegó a cero. La decide la base, con su hora: si todavía queda tiempo, no
-- hace nada.
create or replace function public.arena_bandera(p_partida uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  yo uuid := (select auth.uid());
  p public.arena_partidas%rowtype;
begin
  select * into p from public.arena_partidas where id = p_partida;
  if not found or yo is null or yo not in (p.blancas, p.negras) then
    raise exception 'No juegas en esta partida.' using errcode = '42501';
  end if;
  perform public.arena_vencer(p_partida);
  select * into p from public.arena_partidas where id = p_partida;
  return to_jsonb(p);
end;
$function$;

create or replace function public.arena_rendirse(p_partida uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  yo uuid := (select auth.uid());
  p public.arena_partidas%rowtype;
begin
  select * into p from public.arena_partidas where id = p_partida;
  if not found or yo is null or yo not in (p.blancas, p.negras) then
    raise exception 'No juegas en esta partida.' using errcode = '42501';
  end if;
  perform public.arena_cerrar(p_partida, case when yo = p.blancas then '0-1' else '1-0' end, 'abandono');
  select * into p from public.arena_partidas where id = p_partida;
  return to_jsonb(p);
end;
$function$;

-- Tablas: sin oferta, la hace; con la oferta del rival, la acepta o la rechaza.
create or replace function public.arena_tablas(p_partida uuid, p_aceptar boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  yo uuid := (select auth.uid());
  p public.arena_partidas%rowtype;
  color text;
begin
  select * into p from public.arena_partidas where id = p_partida for update;
  if not found or yo is null or yo not in (p.blancas, p.negras) then
    raise exception 'No juegas en esta partida.' using errcode = '42501';
  end if;
  if p.estado <> 'en_juego' then return to_jsonb(p); end if;
  color := case when yo = p.blancas then 'w' else 'b' end;

  if p.oferta_tablas is null then
    update public.arena_partidas set oferta_tablas = color where id = p.id;
  elsif p.oferta_tablas <> color then
    if coalesce(p_aceptar, true) then
      perform public.arena_cerrar(p.id, '1/2-1/2', 'acuerdo');
    else
      update public.arena_partidas set oferta_tablas = null where id = p.id;
    end if;
  end if;

  select * into p from public.arena_partidas where id = p_partida;
  return to_jsonb(p);
end;
$function$;

-- La clasificación de una arena: cada jugador y, por equipos, la suma de los
-- puntos de los `mejores` de cada uno. Se calcula; no se guarda.
create or replace function public.arena_clasificacion(p_torneo uuid)
 returns jsonb
 language sql
 stable
 security invoker
 set search_path to ''
as $function$
  with t as (
    select mejores from public.arena_torneos where id = p_torneo
  ), res as (
    select p.blancas as jugador, p.puntos_blancas as pts, (p.resultado = '1-0') as gano
      from public.arena_partidas p
     where p.torneo_id = p_torneo and p.estado = 'terminada' and p.resultado is not null
    union all
    select p.negras, p.puntos_negras, (p.resultado = '0-1')
      from public.arena_partidas p
     where p.torneo_id = p_torneo and p.estado = 'terminada' and p.resultado is not null
  ), por_jugador as (
    select j.id, j.nombre, j.equipo_id, e.nombre as equipo,
           coalesce(sum(r.pts), 0)::int as puntos,
           count(r.jugador)::int as partidas,
           count(*) filter (where r.gano)::int as victorias
      from public.arena_jugadores j
      left join public.arena_equipos e on e.id = j.equipo_id
      left join res r on r.jugador = j.id
     where j.id in (select jugador from res)
        or j.id in (select c.jugador_id from public.arena_cola c where c.torneo_id = p_torneo)
        or j.id in (select a.blancas from public.arena_partidas a where a.torneo_id = p_torneo and a.estado = 'en_juego')
        or j.id in (select a.negras from public.arena_partidas a where a.torneo_id = p_torneo and a.estado = 'en_juego')
     group by j.id, j.nombre, j.equipo_id, e.nombre
  ), ordenados as (
    select pj.*, row_number() over (partition by pj.equipo_id order by pj.puntos desc, pj.partidas, pj.nombre) as puesto_en_equipo
      from por_jugador pj
     where pj.equipo_id is not null
  ), por_equipo as (
    select e.id, e.nombre,
           coalesce(sum(o.puntos) filter (where o.puesto_en_equipo <= (select mejores from t)), 0)::int as puntos,
           count(o.id)::int as jugadores
      from public.arena_equipos e
      left join ordenados o on o.equipo_id = e.id
     where exists (select 1 from public.arena_jugadores jj where jj.equipo_id = e.id)
     group by e.id, e.nombre
  )
  select jsonb_build_object(
    'jugadores', coalesce((select jsonb_agg(to_jsonb(x) order by x.puntos desc, x.partidas, x.nombre) from por_jugador x), '[]'::jsonb),
    'equipos', coalesce((select jsonb_agg(to_jsonb(y) order by y.puntos desc, y.nombre) from por_equipo y), '[]'::jsonb)
  )
$function$;

-- Quién va en racha ahora mismo (dos victorias seguidas en esta arena).
create or replace function public.arena_en_racha(p_torneo uuid)
 returns setof uuid
 language sql
 stable
 security invoker
 set search_path to ''
as $function$
  with todas as (
    select p.blancas as jugador, (p.resultado = '1-0') as gano, p.terminada_en
      from public.arena_partidas p
     where p.torneo_id = p_torneo and p.estado = 'terminada' and p.resultado is not null
    union all
    select p.negras, (p.resultado = '0-1'), p.terminada_en
      from public.arena_partidas p
     where p.torneo_id = p_torneo and p.estado = 'terminada' and p.resultado is not null
  ), ult as (
    select jugador, gano,
           row_number() over (partition by jugador order by terminada_en desc) as n
      from todas
  )
  select jugador from ult where n <= 2 group by jugador having count(*) = 2 and bool_and(gano)
$function$;

-- ----------------------------------------------------------------- ejecutar
revoke execute on function public.arena_puntos(uuid, uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.arena_cerrar(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.arena_vencer(uuid) from public, anon, authenticated;
revoke execute on function public.arena_emparejar(uuid) from public, anon, authenticated;

revoke execute on function public.arena_entrar(uuid) from public, anon;
revoke execute on function public.arena_salir(uuid) from public, anon;
revoke execute on function public.arena_mover(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.arena_bandera(uuid) from public, anon;
revoke execute on function public.arena_rendirse(uuid) from public, anon;
revoke execute on function public.arena_tablas(uuid, boolean) from public, anon;
revoke execute on function public.arena_clasificacion(uuid) from public, anon;
revoke execute on function public.arena_en_racha(uuid) from public, anon;

grant execute on function public.arena_entrar(uuid) to authenticated, service_role;
grant execute on function public.arena_salir(uuid) to authenticated, service_role;
grant execute on function public.arena_mover(uuid, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.arena_bandera(uuid) to authenticated, service_role;
grant execute on function public.arena_rendirse(uuid) to authenticated, service_role;
grant execute on function public.arena_tablas(uuid, boolean) to authenticated, service_role;
grant execute on function public.arena_clasificacion(uuid) to authenticated, service_role;
grant execute on function public.arena_en_racha(uuid) to authenticated, service_role;
