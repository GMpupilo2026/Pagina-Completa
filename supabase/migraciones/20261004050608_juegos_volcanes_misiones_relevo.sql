-- Tres juegos nuevos (ver «Volcanes», «Misiones secretas» y «Relevo en
-- silencio» en docs/decisiones/juegos-y-torneos.md).
--
--  * game_rooms y desafios aceptan dos modalidades más: 'volcanes' y
--    'misiones'. Las dos son ajedrez normal en la columna fen (el reloj del
--    trigger sigue leyendo el turno del segundo campo).
--  * misiones_secretas: la misión de cada jugador. La ve solo él (y quien le
--    da clase o administra) mientras se juega; al terminar, la ve todo el que
--    ve la partida. Antes de esto la misión tendría que ir en variant_state, que
--    ve el rival: «quien decide qué se ve es la RLS». No tiene política de
--    escritura: la reparte repartir_misiones(), al azar y en la base.
--  * relevos, relevo_jugadores y relevo_senales: partidas por equipos donde
--    cada integrante hace una jugada por turno, sin hablar. Las jugadas las
--    escribe relevo_jugar(), que comprueba que le toca a quien llama (la
--    rotación la decide la base, no la pantalla). Las señales del equipo
--    («ataca», «defiende», «cuidado») no las ve el equipo rival mientras se
--    juega.
set local lock_timeout = '8s';

-- ============================================== las dos modalidades nuevas
alter table public.game_rooms drop constraint if exists game_rooms_variant_check;
alter table public.game_rooms add constraint game_rooms_variant_check check (variant = any (array[
  'crazyhouse', 'cartas', 'duelo', 'niebla', 'estandar', 'abrazos', 'camaleon', 'ciegas', 'vampiro',
  'volcanes', 'misiones']::text[]));
alter table public.desafios drop constraint if exists desafios_modalidad;
alter table public.desafios add constraint desafios_modalidad check (modalidad = any (array[
  'estandar', 'crazyhouse', 'cartas', 'duelo', 'niebla', 'abrazos', 'camaleon', 'ciegas', 'vampiro',
  'volcanes', 'misiones']::text[]));

-- ============================================== Misiones secretas
create table if not exists public.misiones_secretas (
  sala_id uuid not null references public.game_rooms(id) on delete cascade,
  color text not null check (color in ('w', 'b')),
  jugador_id uuid not null references public.profiles(id) on delete cascade,
  mision text not null,
  created_at timestamptz not null default now(),
  primary key (sala_id, color)
);
create index if not exists misiones_secretas_jugador on public.misiones_secretas (jugador_id);
alter table public.misiones_secretas enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'misiones_secretas' and policyname = 'misiones_secretas_lee') then
    create policy misiones_secretas_lee on public.misiones_secretas for select to authenticated
      using (
        jugador_id = (select auth.uid())
        or coalesce((select mp.is_admin from public.my_profile() mp), false)
        or jugador_id in (select interno.alumnos_de((select auth.uid())))
        -- Terminada la partida, las dos misiones se destapan para quien la ve
        -- (la RLS de game_rooms decide quién la ve).
        or sala_id in (select gr.id from public.game_rooms gr
                        where gr.variant = 'misiones' and gr.status = 'finished')
      );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'misiones_secretas' and policyname = 'verificacion_en_dos_pasos') then
    create policy verificacion_en_dos_pasos on public.misiones_secretas as restrictive for all to authenticated
      using ((select interno.verificacion_al_dia())) with check ((select interno.verificacion_al_dia()));
  end if;
end $$;
grant select on public.misiones_secretas to authenticated;

-- Reparte las dos misiones la primera vez que alguno de los dos entra, y
-- devuelve la de quien llama. El catálogo es el de js/misiones-secretas.js
-- (verificar-misiones-secretas.js comprueba que sean los mismos).
create or replace function public.repartir_misiones(p_sala uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.game_rooms;
  v_color text;
  v_sorteo text[];
  v_mia text;
begin
  select * into r from public.game_rooms where id = p_sala;
  if not found then
    raise exception 'Esa partida no existe.' using errcode = '22023';
  end if;
  if r.variant <> 'misiones' then
    raise exception 'Esa partida no es de Misiones secretas.' using errcode = '22023';
  end if;
  v_color := case when r.white_id = (select auth.uid()) then 'w'
                  when r.black_id = (select auth.uid()) then 'b' end;
  if v_color is null then
    raise exception 'Solo los dos jugadores reciben una misión.' using errcode = '42501';
  end if;

  -- Los dos entran casi a la vez: sin el candado, cada uno sortearía su par
  -- y podrían quedar con la misma misión.
  perform pg_advisory_xact_lock(hashtext('misiones:' || p_sala::text));
  if not exists (select 1 from public.misiones_secretas where sala_id = p_sala) then
    select array_agg(m order by random()) into v_sorteo
      from unnest(array['caballo_avanzado', 'torre_septima', 'sin_alfiles', 'cazar_dama', 'peon_sexta',
                        'torres_dobladas', 'sin_caballos', 'rey_valiente', 'centro', 'ventaja_material']) as m;
    insert into public.misiones_secretas (sala_id, color, jugador_id, mision)
    values (p_sala, 'w', r.white_id, v_sorteo[1]), (p_sala, 'b', r.black_id, v_sorteo[2])
    on conflict do nothing;
  end if;

  select mision into v_mia from public.misiones_secretas where sala_id = p_sala and color = v_color;
  return v_mia;
end;
$$;
revoke execute on function public.repartir_misiones(uuid) from public, anon;
grant execute on function public.repartir_misiones(uuid) to authenticated;

-- ============================================== Relevo en silencio
create table if not exists public.relevos (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves jsonb not null default '[]'::jsonb,
  status text not null default 'playing' check (status in ('playing', 'finished')),
  result text check (result in ('white', 'black', 'draw')),
  motivo text check (motivo in ('jugada', 'rendicion', 'profesor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists relevos_created_by on public.relevos (created_by);

create table if not exists public.relevo_jugadores (
  relevo_id uuid not null references public.relevos(id) on delete cascade,
  jugador_id uuid not null references public.profiles(id) on delete cascade,
  color text not null check (color in ('w', 'b')),
  orden smallint not null check (orden between 0 and 3),
  primary key (relevo_id, jugador_id),
  unique (relevo_id, color, orden)
);
create index if not exists relevo_jugadores_jugador on public.relevo_jugadores (jugador_id);

create table if not exists public.relevo_senales (
  id bigint generated always as identity primary key,
  relevo_id uuid not null references public.relevos(id) on delete cascade,
  color text not null check (color in ('w', 'b')),
  de_id uuid references public.profiles(id) on delete set null,
  senal text not null check (senal in ('ataca', 'defiende', 'cuidado')),
  ply integer not null,
  created_at timestamptz not null default now()
);
-- Una señal por persona y por jugada: son pocas a propósito (no es un chat).
create unique index if not exists relevo_senales_una_por_jugada on public.relevo_senales (relevo_id, de_id, ply);
create index if not exists relevo_senales_de on public.relevo_senales (de_id);

alter table public.relevos enable row level security;
alter table public.relevo_jugadores enable row level security;
alter table public.relevo_senales enable row level security;

-- Los relevos que ve quien llama: los suyos, los que armó, los de sus alumnos
-- y, si administra, todos. Es el conjunto que usan las tres políticas (se arma
-- una vez, no fila por fila), y evita que relevos y relevo_jugadores se
-- pregunten el uno al otro en sus políticas (recursión).
create or replace function interno.mis_relevos()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select rj.relevo_id from public.relevo_jugadores rj where rj.jugador_id = (select auth.uid())
  union
  select r.id from public.relevos r where r.created_by = (select auth.uid())
  union
  select rj.relevo_id from public.relevo_jugadores rj
   where rj.jugador_id in (select interno.alumnos_de((select auth.uid())))
  union
  select r.id from public.relevos r where coalesce((select mp.is_admin from public.my_profile() mp), false);
$$;
revoke execute on function interno.mis_relevos() from public, anon;
grant execute on function interno.mis_relevos() to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'relevos' and policyname = 'relevos_lee') then
    create policy relevos_lee on public.relevos for select to authenticated
      using (id in (select interno.mis_relevos()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'relevo_jugadores' and policyname = 'relevo_jugadores_lee') then
    create policy relevo_jugadores_lee on public.relevo_jugadores for select to authenticated
      using (relevo_id in (select interno.mis_relevos()));
  end if;
  -- Las señales de un equipo no le llegan al otro mientras se juega.
  if not exists (select 1 from pg_policies where tablename = 'relevo_senales' and policyname = 'relevo_senales_lee') then
    create policy relevo_senales_lee on public.relevo_senales for select to authenticated
      using (
        relevo_id in (select interno.mis_relevos())
        and (relevo_id, color) not in (
          select rj.relevo_id, case rj.color when 'w' then 'b' else 'w' end
            from public.relevo_jugadores rj
            join public.relevos r on r.id = rj.relevo_id
           where rj.jugador_id = (select auth.uid()) and r.status = 'playing')
      );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'relevos' and policyname = 'verificacion_en_dos_pasos') then
    create policy verificacion_en_dos_pasos on public.relevos as restrictive for all to authenticated
      using ((select interno.verificacion_al_dia())) with check ((select interno.verificacion_al_dia()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'relevo_jugadores' and policyname = 'verificacion_en_dos_pasos') then
    create policy verificacion_en_dos_pasos on public.relevo_jugadores as restrictive for all to authenticated
      using ((select interno.verificacion_al_dia())) with check ((select interno.verificacion_al_dia()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'relevo_senales' and policyname = 'verificacion_en_dos_pasos') then
    create policy verificacion_en_dos_pasos on public.relevo_senales as restrictive for all to authenticated
      using ((select interno.verificacion_al_dia())) with check ((select interno.verificacion_al_dia()));
  end if;
end $$;
grant select on public.relevos, public.relevo_jugadores, public.relevo_senales to authenticated;

-- Arma un relevo: quien da clase (con sus alumnos y consigo) o quien
-- administra, igual que una partida de game_rooms (puedo_armar_partida_con).
create or replace function public.crear_relevo(p_blancas uuid[], p_negras uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_todos uuid[] := coalesce(p_blancas, '{}') || coalesce(p_negras, '{}');
  v_id uuid;
  i integer;
begin
  if coalesce(cardinality(p_blancas), 0) not between 1 and 4 or coalesce(cardinality(p_negras), 0) not between 1 and 4 then
    raise exception 'Cada equipo lleva de 1 a 4 integrantes.' using errcode = '22023';
  end if;
  if cardinality(v_todos) < 3 then
    raise exception 'Un relevo necesita al menos 3 jugadores (si no, es una partida común).' using errcode = '22023';
  end if;
  if array_position(v_todos, null) is not null
     or (select count(distinct x) from unnest(v_todos) as x) <> cardinality(v_todos) then
    raise exception 'Cada jugador va en un solo equipo, una sola vez.' using errcode = '22023';
  end if;
  if not coalesce(public.puedo_armar_partida_con(v_todos), false) then
    raise exception 'Solo puedes armar relevos con tus alumnos.' using errcode = '42501';
  end if;

  insert into public.relevos (created_by) values ((select auth.uid())) returning id into v_id;
  for i in 1 .. cardinality(p_blancas) loop
    insert into public.relevo_jugadores (relevo_id, jugador_id, color, orden) values (v_id, p_blancas[i], 'w', i - 1);
  end loop;
  for i in 1 .. cardinality(p_negras) loop
    insert into public.relevo_jugadores (relevo_id, jugador_id, color, orden) values (v_id, p_negras[i], 'b', i - 1);
  end loop;
  return v_id;
end;
$$;
revoke execute on function public.crear_relevo(uuid[], uuid[]) from public, anon;
grant execute on function public.crear_relevo(uuid[], uuid[]) to authenticated;

-- A quién le toca: el integrante (orden) que sigue en la rotación del color
-- que mueve. Cada equipo cuenta sus propias jugadas.
create or replace function interno.relevo_a_quien_le_toca(p_relevo uuid, p_fen text, p_jugadas integer)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.jugador_id from (
    select rj.jugador_id, row_number() over (order by rj.orden) - 1 as i, count(*) over () as n
      from public.relevo_jugadores rj
     where rj.relevo_id = p_relevo
       and rj.color = case when split_part(p_fen, ' ', 2) = 'b' then 'b' else 'w' end
  ) t
  where t.i = (p_jugadas / 2) % t.n;
$$;
revoke execute on function interno.relevo_a_quien_le_toca(uuid, text, integer) from public, anon, authenticated;

-- Una jugada. La legalidad la comprueba chess.js en la pantalla (como en las
-- demás partidas); la base comprueba lo que una consola podría saltarse: que
-- le toque a quien llama y que la jugada salga de la posición guardada.
create or replace function public.relevo_jugar(p_relevo uuid, p_fen_antes text, p_fen text, p_san text, p_resultado text default null)
returns public.relevos
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.relevos;
  v_jugadas integer;
begin
  select * into r from public.relevos where id = p_relevo for update;
  if not found then
    raise exception 'Ese relevo no existe.' using errcode = '22023';
  end if;
  if r.status <> 'playing' then
    raise exception 'La partida ya terminó.' using errcode = '22023';
  end if;
  if r.fen is distinct from p_fen_antes then
    raise exception 'La partida ya iba más adelante.' using errcode = '22023';
  end if;
  v_jugadas := jsonb_array_length(r.moves);
  if interno.relevo_a_quien_le_toca(p_relevo, r.fen, v_jugadas) is distinct from (select auth.uid()) then
    raise exception 'Todavía no es tu turno en el relevo.' using errcode = '42501';
  end if;
  if not coalesce(public.acceso_vigente(), false) then
    raise exception 'Tu acceso a la Academia no está vigente.' using errcode = '42501';
  end if;
  if p_fen is null or char_length(p_fen) > 100
     or split_part(p_fen, ' ', 2) <> (case when split_part(r.fen, ' ', 2) = 'b' then 'w' else 'b' end) then
    raise exception 'Esa posición no sigue a la anterior.' using errcode = '22023';
  end if;
  if p_san is null or char_length(p_san) not between 2 and 12 then
    raise exception 'Jugada inválida.' using errcode = '22023';
  end if;
  if p_resultado is not null and p_resultado not in ('white', 'black', 'draw') then
    raise exception 'Resultado inválido.' using errcode = '22023';
  end if;

  update public.relevos
     set fen = p_fen,
         moves = moves || to_jsonb(p_san),
         status = case when p_resultado is null then 'playing' else 'finished' end,
         result = p_resultado,
         motivo = case when p_resultado is null then null else 'jugada' end,
         updated_at = now()
   where id = p_relevo
  returning * into r;
  return r;
end;
$$;
revoke execute on function public.relevo_jugar(uuid, text, text, text, text) from public, anon;
grant execute on function public.relevo_jugar(uuid, text, text, text, text) to authenticated;

-- Una señal para el propio equipo.
create or replace function public.relevo_senal(p_relevo uuid, p_senal text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.relevos;
  v_color text;
begin
  select * into r from public.relevos where id = p_relevo;
  if not found or r.status <> 'playing' then
    raise exception 'La partida ya terminó.' using errcode = '22023';
  end if;
  select color into v_color from public.relevo_jugadores where relevo_id = p_relevo and jugador_id = (select auth.uid());
  if v_color is null then
    raise exception 'Solo los integrantes del relevo mandan señales.' using errcode = '42501';
  end if;
  if p_senal not in ('ataca', 'defiende', 'cuidado') then
    raise exception 'Esa señal no existe.' using errcode = '22023';
  end if;
  begin
    insert into public.relevo_senales (relevo_id, color, de_id, senal, ply)
    values (p_relevo, v_color, (select auth.uid()), p_senal, jsonb_array_length(r.moves));
  exception when unique_violation then
    raise exception 'Ya mandaste una señal en esta jugada.' using errcode = '22023';
  end;
end;
$$;
revoke execute on function public.relevo_senal(uuid, text) from public, anon;
grant execute on function public.relevo_senal(uuid, text) to authenticated;

-- Rendirse (por el equipo), o terminar la partida quien la armó / da clase.
create or replace function public.relevo_terminar(p_relevo uuid, p_resultado text default null)
returns public.relevos
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.relevos;
  v_color text;
begin
  select * into r from public.relevos where id = p_relevo for update;
  if not found or p_relevo not in (select interno.mis_relevos()) then
    raise exception 'Ese relevo no existe.' using errcode = '22023';
  end if;
  if r.status <> 'playing' then
    raise exception 'La partida ya había terminado.' using errcode = '22023';
  end if;
  select color into v_color from public.relevo_jugadores where relevo_id = p_relevo and jugador_id = (select auth.uid());
  if v_color is not null then
    -- Un integrante solo puede rendir a su equipo.
    update public.relevos
       set status = 'finished', result = case v_color when 'w' then 'black' else 'white' end,
           motivo = 'rendicion', updated_at = now()
     where id = p_relevo returning * into r;
  else
    if p_resultado is null or p_resultado not in ('white', 'black', 'draw') then
      raise exception 'Di cómo termina: ganan blancas, negras o tablas.' using errcode = '22023';
    end if;
    update public.relevos
       set status = 'finished', result = p_resultado, motivo = 'profesor', updated_at = now()
     where id = p_relevo returning * into r;
  end if;
  return r;
end;
$$;
revoke execute on function public.relevo_terminar(uuid, text) from public, anon;
grant execute on function public.relevo_terminar(uuid, text) to authenticated;

-- La sala del relevo y las señales se escuchan por Realtime (filtradas al
-- relevo que se mira).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'relevos') then
    alter publication supabase_realtime add table public.relevos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'relevo_senales') then
    alter publication supabase_realtime add table public.relevo_senales;
  end if;
end $$;