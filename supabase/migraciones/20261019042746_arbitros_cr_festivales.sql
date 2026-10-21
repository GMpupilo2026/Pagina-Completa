-- Herramienta «Árbitros de Costa Rica» (arbitros-cr.html): los titulados de
-- cada torneo y las cifras de su festival, para saber si un torneo es de
-- categoría C de árbitro (B.06.3, 1.3.3.2 c: 9 rondas, más de 150
-- participantes, 75 % con rating y 20 titulados de 3 federaciones, como torneo
-- único o como festival). Ver «Para subir de categoría en FIDE» en
-- docs/decisiones/juegos-y-torneos.md.
--
--   titulados        cuántos jugadores con Elo del torneo tienen un título de
--                    GM, IM, FM, WGM, WIM o WFM (no CM ni WCM), con la lista de
--                    FIDE de hoy.
--   titulados_feds   {federación: titulados}.
--   festival         el festival al que pertenece el torneo (los eventos de la
--                    misma ciudad, con fechas que se traslapan y nombre
--                    parecido), con sus cifras sumadas: ids (todos sus eventos),
--                    estandar (los de ritmo estándar, los únicos que suman),
--                    participantes, con_elo y titulados (personas distintas),
--                    federaciones, feds_titulados, rondas_min (0 si FIDE no las
--                    publica) y solo_otro_ritmo (titulados que jugaron solo el
--                    blitz o el rápido y no suman).
--
-- Los lee quien tiene la herramienta, como el resto de la tabla (la política
-- ya existe). Los escribe herramientas/arbitros-cr.py, desde la base.

alter table public.arbitros_cr_torneos
  add column titulados smallint not null default 0 check (titulados >= 0),
  add column titulados_feds jsonb not null default '{}'::jsonb check (jsonb_typeof(titulados_feds) = 'object'),
  add column festival jsonb check (festival is null or jsonb_typeof(festival) = 'object');

comment on column public.arbitros_cr_torneos.titulados is
  'Jugadores con Elo del torneo con título de GM, IM, FM, WGM, WIM o WFM (lista de FIDE de hoy).';
comment on column public.arbitros_cr_torneos.titulados_feds is
  'Titulados del torneo por federación: {"CRC": 12, "CUB": 2}.';
comment on column public.arbitros_cr_torneos.festival is
  'El festival del torneo y sus cifras sumadas para la categoría C de árbitro (B.06.3, 1.3.3.2 c): ids, estandar, participantes, con_elo, titulados, federaciones, feds_titulados, rondas_min, solo_otro_ritmo.';