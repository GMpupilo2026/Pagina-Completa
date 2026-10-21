-- La lista de la Federación marca a todos los que figuran en ella, no solo a
-- los AN: fca_leida es la fecha de la lista en que figura cada uno (los FA e IA
-- también, con categoria_nacional nula). La página toma como «en la lista de la
-- Federación» a quien tiene la fca_leida más nueva, para comparar la lista con
-- quién arbitra de verdad. La llena herramientas/arbitros-cr/lista-fide.py.
comment on column public.arbitros_cr_fide.fca_leida is
  'La fecha de la lista de la Federación Central de Ajedrez en que figura (todos sus árbitros, no solo los AN). Quien no tiene la más nueva ya no está en ella.';