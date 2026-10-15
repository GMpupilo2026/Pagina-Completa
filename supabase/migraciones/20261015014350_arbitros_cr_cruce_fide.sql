-- Herramienta «Árbitros de Costa Rica» (arbitros-cr.html): el mismo torneo en
-- FIDE y en chess-results.
--
--   arbitros_cr_cr.fide_torneo  el torneo de FIDE (arbitros_cr_torneos.id)
--                        que es este mismo torneo de chess-results, para que
--                        la página no lo cuente dos veces y pueda filtrar
--                        «FIDE» y «No FIDE». Nulo si no se encontró. Lo
--                        decide cruzar_con_fide() en herramientas/arbitros-cr.py.
--
-- Ver «El mismo torneo en FIDE y en chess-results» en
-- docs/decisiones/juegos-y-torneos.md.

alter table public.arbitros_cr_cr
  add column fide_torneo integer references public.arbitros_cr_torneos (id) on delete set null;
create unique index arbitros_cr_cr_fide_torneo on public.arbitros_cr_cr (fide_torneo) where fide_torneo is not null;
comment on column public.arbitros_cr_cr.fide_torneo is
  'El torneo de FIDE que es este mismo torneo (uno a uno), o nulo. Lo decide herramientas/arbitros-cr.py.';
