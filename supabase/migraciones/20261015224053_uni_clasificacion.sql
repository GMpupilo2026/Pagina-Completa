-- La clasificación completa de los torneos del catálogo (uni_torneos) que no
-- están en uni_resultados: los de una universidad (los Blitz del club de la
-- UCR, el interno del TEC, los de CENFOTEC, la UNED y la UISIL) y los grupos
-- del Interuniversitario 2011. Con ella, la ficha de un jugador en
-- torneos-universitarios.html junta todos sus torneos, no solo los podios.
-- La llena herramientas/universidades/clasificacion.sql desde chess-results.
-- Ver «La ficha del jugador universitario» en docs/decisiones/juegos-y-torneos.md.
create table public.uni_clasificacion (
  tnr integer not null,
  orden smallint not null,
  puesto smallint not null,
  nombre text not null,
  titulo text not null default '',
  elo smallint,
  club text not null default '',
  puntos numeric(4,1),
  primary key (tnr, orden)
);
comment on table public.uni_clasificacion is 'La clasificación (art=1 de chess-results) de los torneos de uni_torneos que no están en uni_resultados. Se lee con la herramienta «universidades»; no se escribe desde afuera.';

alter table public.uni_clasificacion enable row level security;
create policy uni_clasificacion_leer on public.uni_clasificacion
  for select to authenticated using ((select public.tengo_herramienta('universidades')));
revoke insert, update, delete, truncate on public.uni_clasificacion from anon, authenticated;
grant select on public.uni_clasificacion to authenticated;
