-- Herramienta de arbitraje «Resultados JDN por comité» (jdn-comites.html).
--
-- Cada fila es un puesto de un torneo de los Juegos Deportivos Nacionales
-- publicado en chess-results: un jugador (tipo I) o un equipo (tipo E), con
-- su comité tal como lo escribió chess-results. La página junta las variantes
-- de un mismo comité y deduce el que falta.
--
-- EL CANDADO ES LA BASE: solo lee quien tiene la herramienta (licencia
-- vigente de 'jdn-comites' o de 'todas', o administración), con
-- tengo_herramienta(). No hay política de escritura: la tabla se llena desde
-- la base leyendo chess-results (herramientas/jdn-comites/cargar.sql).
-- Ver «Resultados JDN por comité» en docs/decisiones/juegos-y-torneos.md.

create table public.jdn_resultados (
  id bigint generated always as identity primary key,
  edicion text not null check (edicion ~ '^20\d\d-[EF]$'),
  codigo text not null check (codigo ~ '^(C|R|B|Z1|Z2|)-U(12|16|20)-[IE][AF]$'),
  tnr integer not null check (tnr > 0),
  orden smallint not null check (orden > 0),
  puesto smallint check (puesto > 0),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  comite text not null default '' check (char_length(comite) <= 80),
  record text check (record is null or record ~ '^\d{1,2}-\d{1,2}-\d{1,2}$'),
  puntos numeric(4,1) not null,
  unique (edicion, codigo, orden)
);
comment on table public.jdn_resultados is
  'Resultados de los torneos JDN de chess-results para la herramienta jdn-comites. Edición AAAA-E (eliminatoria) o AAAA-F (final); código ritmo/zona-categoría-modo+rama; puesto vacío = empatado con el de arriba; record G-E-P de los equipos cuando chess-results trae la tabla final. Solo la lee quien tiene la herramienta.';

alter table public.jdn_resultados enable row level security;
revoke all on public.jdn_resultados from anon;
revoke insert, update, delete, truncate on public.jdn_resultados from authenticated;
grant select on public.jdn_resultados to authenticated;

create policy jdn_resultados_con_herramienta on public.jdn_resultados
  for select to authenticated
  using ((select public.tengo_herramienta('jdn-comites')));