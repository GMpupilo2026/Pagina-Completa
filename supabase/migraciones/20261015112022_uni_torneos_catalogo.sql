-- «Torneos universitarios de Costa Rica» (torneos-universitarios.html): el
-- catálogo de TODOS los torneos universitarios que están en chess-results,
-- uno por fila: los que se juegan entre universidades (los de la herramienta
-- «Resultados universitarios por universidad», con su edición) y los que
-- organiza una universidad para su gente o abiertos (los Blitz del club de la
-- UCR, el Desafío Mentes Maestras de CENFOTEC, los recreativos de la UNED…).
-- Cada uno con su fecha, quién lo organiza, cuántos jugaron y su podio.
--
-- Va con la misma licencia que la herramienta de universidades
-- (tengo_herramienta('universidades')). No se escribe desde afuera: la llena
-- herramientas/universidades/catalogo.sql. Ver «Torneos universitarios de
-- Costa Rica» en docs/decisiones/juegos-y-torneos.md.

create table public.uni_torneos (
  tnr integer primary key check (tnr > 0),
  nombre text not null check (char_length(btrim(nombre)) between 3 and 160),
  inicio date not null,
  lugar text not null default '' check (char_length(lugar) <= 160),
  organiza text not null check (char_length(btrim(organiza)) between 2 and 80),
  tipo text not null check (tipo in ('entre universidades', 'de una universidad')),
  edicion text check (edicion is null or edicion ~ '^20\d\d-[A-Z]{2,8}\d?$'),
  ritmo text not null check (ritmo in ('C', 'R', 'B')),
  modalidad text not null check (modalidad in ('I', 'E')),
  jugadores smallint not null check (jugadores >= 0),
  en_curso boolean not null default false,
  podio jsonb not null default '[]'::jsonb check (jsonb_typeof(podio) = 'array')
);
comment on table public.uni_torneos is
  'Catálogo de los torneos universitarios de Costa Rica en chess-results (entre universidades y de una universidad) para torneos-universitarios.html: fecha, quién organiza, ritmo (C/R/B), modalidad (I/E), jugadores y podio [{p, n, u}] (puesto, nombre del jugador o equipo, universidad como la escribe chess-results). Solo la lee quien tiene la herramienta universidades.';

alter table public.uni_torneos enable row level security;
revoke all on public.uni_torneos from anon;
revoke insert, update, delete, truncate on public.uni_torneos from authenticated;
grant select on public.uni_torneos to authenticated;

create policy uni_torneos_con_herramienta on public.uni_torneos
  for select to authenticated using ((select public.tengo_herramienta('universidades')));
