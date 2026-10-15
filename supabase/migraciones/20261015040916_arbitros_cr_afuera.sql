-- Herramienta «Árbitros de Costa Rica» (arbitros-cr.html): los torneos que
-- arbitraron en el extranjero. Salen del mismo buscador de chess-results, en
-- todos los países, así que van en la misma tabla con la federación del
-- torneo (el código de tres letras que da el buscador). Los de Costa Rica ya
-- cargados quedan con CRC. Ver «Árbitros de Costa Rica en el extranjero» en
-- docs/decisiones/juegos-y-torneos.md.

alter table public.arbitros_cr_cr add column pais text not null default 'CRC' check (pais ~ '^[A-Z]{3}$');

comment on column public.arbitros_cr_cr.pais is
  'La federación del torneo en chess-results (CRC, PAN, HON…): distinta de CRC es un torneo en el extranjero, que no se cruza con FIDE.';
comment on table public.arbitros_cr_cr is
  'Torneos de chess-results con algún árbitro de Costa Rica (de la federación de Costa Rica y, con pais distinto de CRC, los que arbitraron en el extranjero), para la herramienta arbitros-cr. El nombre llega cortado a 50 letras (así lo da el buscador). Solo la lee quien tiene la herramienta.';
