-- Carga 21 de 21 de la herramienta arbitros-cr. La arma herramientas/arbitros-cr.py: no se edita a mano.
update public.arbitros_cr_cr c set fide_torneo = v.fide from (values
  (1167290, 416271),
  (1212209, 428660),
  (1241286, 433885)
) v(clave, fide) where c.clave = v.clave;
