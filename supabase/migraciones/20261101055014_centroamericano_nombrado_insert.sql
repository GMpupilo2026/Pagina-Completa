-- Centroamericano 2026: crear un enlace de árbitro «por definir».
-- La migración de los avisos dejó a quien organiza CAMBIAR `nombrado` (update), pero no
-- ponerlo al CREAR el enlace: sin este permiso, «Árbitro 3» nacería con nombrado = true
-- y nadie sabría que falta el nombre. Ver «Avisos y árbitros por definir» en
-- docs/decisiones/juegos-y-torneos.md.

grant insert (nombrado) on public.centroamericano_asignaciones to authenticated;
