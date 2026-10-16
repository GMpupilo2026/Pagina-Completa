-- Herramienta «Árbitros de Costa Rica» (arbitros-cr.html): la fecha OFICIAL
-- del título de AF (y de AI) es la que FIDE anota en su base, la del perfil
-- («License level: FIDE Arbiter Category D (2024-12-15)»), no la de la reunión
-- del Consejo que lo aprobó: suele ser de dos a cinco semanas después, y FIDE
-- rechaza como «before FA» una norma entre las dos (ver «La fecha oficial del
-- título: la del perfil de FIDE» en docs/decisiones/juegos-y-torneos.md).
-- La llena herramientas/arbitros-cr/lista-fide.py desde el JSON, cuando se
-- conoce (el perfil de FIDE no contesta a la base: se copia a mano de una
-- captura).

alter table public.arbitros_cr_fide
  add column af_perfil date,
  add column ia_perfil date;
comment on column public.arbitros_cr_fide.af_perfil is
  'La fecha del título de AF en el perfil de FIDE (la oficial: desde ahí cuentan las normas de AI). Nula si no se conoce; entonces vale af_fecha, la del Consejo, con 60 días para revisar.';
comment on column public.arbitros_cr_fide.ia_perfil is
  'La fecha del título de AI en el perfil de FIDE, si se conoce.';
