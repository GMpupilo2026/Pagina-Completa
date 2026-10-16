-- Herramienta «Árbitros de Costa Rica» (arbitros-cr.html): la categoría
-- nacional de cada Árbitro Nacional (A, B o C), que la lista oficial de FIDE
-- no trae. Sale de la lista de árbitros de la Federación Central de Ajedrez
-- de Costa Rica (fcacostarica.com/lista-de-arbitros, «NAA», «NAB», «NAC»), y
-- fca_leida dice qué día se leyó. La llena herramientas/arbitros-cr/lista-fide.py
-- desde herramientas/datos/arbitros-cr-lista-fca.json (ver «La categoría
-- nacional: la lista de la Federación» en docs/decisiones/juegos-y-torneos.md).

alter table public.arbitros_cr_fide
  add column categoria_nacional text check (categoria_nacional in ('A', 'B', 'C')),
  add column fca_leida date;
comment on column public.arbitros_cr_fide.categoria_nacional is
  'La categoría nacional de un Árbitro Nacional (A, B o C) según la lista de la Federación Central de Ajedrez. Nula si no figura ahí o si es FA o IA.';
comment on column public.arbitros_cr_fide.fca_leida is
  'Qué día se leyó la lista de la Federación de la que sale categoria_nacional.';