-- «Resultados JDN por comité» (jdn-comites.html): cada jugador de cada torneo
-- JDN con sus partidas y su Elo, para dos cosas que jdn_resultados no trae:
--
--   · quiénes jugaron en cada equipo (en jdn_resultados un equipo es una fila),
--     con su tablero, en eliminatorias y finales;
--   · el rendimiento contra el Elo: cuántas partidas jugó de verdad (sin
--     forfeits ni byes), cuántos puntos sacó, el Elo medio de sus rivales con
--     Elo y los puntos que se esperaban de él según la fórmula de FIDE.
--
-- De los torneos individuales sale de la tabla cruzada (art=4) y de la
-- clasificación (art=1); de los por equipos, de la composición de equipos con
-- la información de cada jugador partida por partida (art=20). En los
-- individuales, orden es el mismo de jdn_resultados (el puesto en la tabla).
--
-- Mismo candado que jdn_resultados: solo lee quien tiene la herramienta. No
-- hay política de escritura: se llena desde la base leyendo chess-results
-- (herramientas/jdn-comites/cargar-jugadores.sql).
-- Ver «Los integrantes de cada equipo» y «El rendimiento contra el Elo» en
-- docs/decisiones/juegos-y-torneos.md.

create table public.jdn_jugadores (
  id bigint generated always as identity primary key,
  edicion text not null check (edicion ~ '^20\d\d-[EF]$'),
  codigo text not null check (codigo ~ '^(C|R|B|Z1|Z2|)-U(12|16|20)-[IE][AF]$'),
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
comment on table public.jdn_jugadores is
  'Cada jugador de cada torneo JDN de chess-results, para la herramienta jdn-comites: su equipo y tablero (en los torneos por equipos), su Elo, las partidas jugadas de verdad y sus puntos, y contra rivales con Elo: partidas, puntos, Elo medio y puntos esperados (FIDE). Solo la lee quien tiene la herramienta.';

alter table public.jdn_jugadores enable row level security;
revoke all on public.jdn_jugadores from anon;
revoke insert, update, delete, truncate on public.jdn_jugadores from authenticated;
grant select on public.jdn_jugadores to authenticated;

create policy jdn_jugadores_con_herramienta on public.jdn_jugadores
  for select to authenticated
  using ((select public.tengo_herramienta('jdn-comites')));
