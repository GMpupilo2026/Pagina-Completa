-- Los seis torneos del Rápido del Centroamericano 2026 en chess-results, uno por edad (U08 a U18), para que la
-- organización arme los enlaces de los árbitros como en el clásico.
--
-- Cada uno junta a varones y mujeres (la rama femenina es un grupo dentro del torneo): van con la rama nueva
-- «Mixto». No «Absoluto», a propósito: la función de Fair Play busca el torneo por categoría y rama, sin orden, y
-- con un segundo «Sub-10 Absoluto» podía tomar el del Rápido en vez del clásico.
-- El nombre empieza con «Rápido»: por ese nombre la página del árbitro se pone en modo rápido (ritmoRapido en
-- js/centroamericano-mesas.js; ver «El Rápido y el Blitz: la mesa en un toque» en docs/decisiones/juegos-y-torneos.md).
-- La clave (SID) la pone la organización en centroamericano-mesas.html: «poner» la deja para todos los torneos de esta
-- tabla que abra esa clave. Ritmo en chess-results: 10 minutos + 2 segundos por jugada, 9 rondas.

alter table public.centroamericano_torneos drop constraint centroamericano_torneos_rama_check;
alter table public.centroamericano_torneos add constraint centroamericano_torneos_rama_check
  check (rama in ('Absoluto', 'Femenino', 'Mixto'));

insert into public.centroamericano_torneos (tnr, nombre, categoria, rama, orden) values
  ('1533950', 'Rápido Sub-8',  'Sub-8',  'Mixto', 101),
  ('1533951', 'Rápido Sub-10', 'Sub-10', 'Mixto', 102),
  ('1533953', 'Rápido Sub-12', 'Sub-12', 'Mixto', 103),
  ('1533958', 'Rápido Sub-14', 'Sub-14', 'Mixto', 104),
  ('1533957', 'Rápido Sub-16', 'Sub-16', 'Mixto', 105),
  ('1533956', 'Rápido Sub-18', 'Sub-18', 'Mixto', 106);
