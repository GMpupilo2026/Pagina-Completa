-- Herramienta de arbitraje «Resultados universitarios por universidad»
-- (universidades.html): los torneos universitarios de ajedrez de Costa Rica
-- (JUNCOS, CONARE, FEDEU, FECUNDE…) y los centroamericanos (JUDUCA) que están
-- en chess-results, ordenados por universidad.
--
-- Son las mismas cuatro tablas de «Resultados JDN por comité», con la misma
-- forma, para que una sola página (js/jdn-comites.js) sirva a las dos: en
-- estas, «comite» es la universidad tal como la escribe chess-results. La
-- edición es AAAA-EVENTO (2023-JUNCOS, 2026-CONARE2) y el código
-- ritmo-categoría-modo+rama, con categoría U (universitario), UB (división B
-- de un torneo partido en dos) o FUN (funcionarios).
--
-- EL CANDADO ES LA BASE: solo lee quien tiene la herramienta 'universidades'
-- (o 'todas', o administración), con tengo_herramienta(). Las tres primeras
-- no se escriben desde afuera: se llenan desde la base leyendo chess-results
-- (herramientas/universidades/). Las correcciones solo las escribe quien
-- administra. Ver «Resultados universitarios por universidad» en
-- docs/decisiones/juegos-y-torneos.md.

create table public.uni_resultados (
  id bigint generated always as identity primary key,
  edicion text not null check (edicion ~ '^20\d\d-[A-Z]{2,8}\d?$'),
  codigo text not null check (codigo ~ '^(C|R|B)-(U|UB|FUN)-[IE][AF]$'),
  tnr integer not null check (tnr > 0),
  orden smallint not null check (orden > 0),
  puesto smallint check (puesto > 0),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  comite text not null default '' check (char_length(comite) <= 80),
  record text check (record is null or record ~ '^\d{1,2}-\d{1,2}-\d{1,2}$'),
  puntos numeric(4,1) not null,
  unique (edicion, codigo, orden)
);
comment on table public.uni_resultados is
  'Resultados de los torneos universitarios de chess-results para la herramienta universidades (comite = la universidad como la escribe chess-results). Edición AAAA-EVENTO; código ritmo-categoría-modo+rama; puesto vacío = empatado con el de arriba. Solo la lee quien tiene la herramienta.';

create table public.uni_jugadores (
  id bigint generated always as identity primary key,
  edicion text not null check (edicion ~ '^20\d\d-[A-Z]{2,8}\d?$'),
  codigo text not null check (codigo ~ '^(C|R|B)-(U|UB|FUN)-[IE][AF]$'),
  tnr integer not null check (tnr > 0),
  orden smallint not null check (orden > 0),
  equipo text check (equipo is null or char_length(btrim(equipo)) between 1 and 80),
  equipo_orden smallint check (equipo_orden > 0),
  tablero smallint check (tablero between 1 and 20),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  elo smallint check (elo > 0),
  partidas smallint not null check (partidas >= 0),
  puntos numeric(4,1) not null check (puntos >= 0),
  con_elo smallint not null check (con_elo between 0 and partidas),
  puntos_elo numeric(4,1) not null check (puntos_elo >= 0),
  elo_rivales smallint check (elo_rivales > 0),
  esperado numeric(5,2) check (esperado >= 0),
  unique (tnr, orden)
);
comment on table public.uni_jugadores is
  'Cada jugador de cada torneo universitario de chess-results, para la herramienta universidades: su equipo y tablero, su Elo, sus partidas y, contra rivales con Elo, partidas, puntos, Elo medio y puntos esperados (FIDE). Solo la lee quien tiene la herramienta.';

create table public.uni_partidas (
  id bigint generated always as identity primary key,
  tnr integer not null check (tnr > 0),
  ronda smallint not null check (ronda >= 0),
  orden smallint not null check (orden > 0),
  rival smallint not null check (rival > orden),
  vez smallint not null default 1 check (vez between 1 and 4),
  puntos numeric(2,1) not null check (puntos in (0, 0.5, 1)),
  unique (tnr, ronda, orden, rival, vez)
);
comment on table public.uni_partidas is
  'Cada partida jugada de los torneos universitarios de chess-results, una vez (desde el de menor orden), para los enfrentamientos entre universidades. orden y rival son los de uni_jugadores. Solo la lee quien tiene la herramienta.';

create table public.uni_correcciones (
  id bigint generated always as identity primary key,
  nombre text not null check (nombre ~ '^[a-z ]{3,120}$'),
  edicion text check (edicion is null or edicion ~ '^20\d\d-[A-Z]{2,8}\d?$'),
  comite text not null check (char_length(btrim(comite)) between 2 and 80),
  nota text check (nota is null or char_length(nota) <= 300),
  creado_por uuid default auth.uid() references public.profiles(id) on delete set null,
  creado timestamptz not null default now()
);
create unique index uni_correcciones_una on public.uni_correcciones (nombre, coalesce(edicion, ''));
comment on table public.uni_correcciones is
  'Universidad de un jugador corregida a mano por administración para la herramienta universidades: nombre es la clave de la página (minúsculas, sin tildes); sin edición vale para todas.';

alter table public.uni_resultados enable row level security;
alter table public.uni_jugadores enable row level security;
alter table public.uni_partidas enable row level security;
alter table public.uni_correcciones enable row level security;
revoke all on public.uni_resultados, public.uni_jugadores, public.uni_partidas, public.uni_correcciones from anon;
revoke insert, update, delete, truncate on public.uni_resultados, public.uni_jugadores, public.uni_partidas from authenticated;
revoke truncate on public.uni_correcciones from authenticated;
grant select on public.uni_resultados, public.uni_jugadores, public.uni_partidas to authenticated;
grant select, insert, update, delete on public.uni_correcciones to authenticated;

create policy uni_resultados_con_herramienta on public.uni_resultados
  for select to authenticated using ((select public.tengo_herramienta('universidades')));
create policy uni_jugadores_con_herramienta on public.uni_jugadores
  for select to authenticated using ((select public.tengo_herramienta('universidades')));
create policy uni_partidas_con_herramienta on public.uni_partidas
  for select to authenticated using ((select public.tengo_herramienta('universidades')));
create policy uni_correcciones_con_herramienta on public.uni_correcciones
  for select to authenticated using ((select public.tengo_herramienta('universidades')));
create policy uni_correcciones_admin_crea on public.uni_correcciones
  for insert to authenticated
  with check ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)));
create policy uni_correcciones_admin_cambia on public.uni_correcciones
  for update to authenticated
  using ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)))
  with check ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)));
create policy uni_correcciones_admin_borra on public.uni_correcciones
  for delete to authenticated
  using ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)));
