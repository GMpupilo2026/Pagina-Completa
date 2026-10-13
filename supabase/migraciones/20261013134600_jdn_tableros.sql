-- «Resultados JDN por comité» (jdn-comites.html): los mejores tableros de las
-- finales por equipos.
--
-- Cada fila es un puesto de la «Clasificación por tableros» de chess-results
-- (art=81) de un torneo por equipos de una final JDN: el tablero (5 es la
-- reserva en las finales 2018-2021), el puesto en ese tablero, el jugador, su
-- equipo y el porcentaje. Se guarda el orden que publica chess-results, que
-- es el oficial de cada torneo: cada árbitro eligió sus desempates y su mínimo
-- de partidas, y chess-results ya deja afuera a quien no llegó al mínimo.
--
-- Mismo candado que jdn_resultados: solo lee quien tiene la herramienta. No
-- hay política de escritura: se llena desde la base leyendo chess-results
-- (herramientas/jdn-comites/cargar-tableros.sql).
-- Ver «Los mejores tableros de las finales» en docs/decisiones/juegos-y-torneos.md.

create table public.jdn_tableros (
  id bigint generated always as identity primary key,
  edicion text not null check (edicion ~ '^20\d\d-F$'),
  codigo text not null check (codigo ~ '^(C|R|B)-U(12|16|20)-E[AF]$'),
  tnr integer not null check (tnr > 0),
  tablero smallint not null check (tablero between 1 and 9),
  orden smallint not null check (orden > 0),
  puesto smallint check (puesto > 0),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  equipo text not null check (char_length(btrim(equipo)) between 1 and 80),
  porcentaje numeric(4,1) not null check (porcentaje between 0 and 100),
  puntos numeric(4,1),
  unique (tnr, tablero, orden)
);
comment on table public.jdn_tableros is
  'Clasificación por tableros (chess-results art=81) de los torneos por equipos de las finales JDN, para la herramienta jdn-comites. Tablero 5 = reserva; puesto vacío = empatado con el de arriba. Solo la lee quien tiene la herramienta.';

alter table public.jdn_tableros enable row level security;
revoke all on public.jdn_tableros from anon;
revoke insert, update, delete, truncate on public.jdn_tableros from authenticated;
grant select on public.jdn_tableros to authenticated;

create policy jdn_tableros_con_herramienta on public.jdn_tableros
  for select to authenticated
  using ((select public.tengo_herramienta('jdn-comites')));
