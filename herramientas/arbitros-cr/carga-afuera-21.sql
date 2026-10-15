-- Carga 21 de 21 de la herramienta arbitros-cr. La arma herramientas/arbitros-cr.py: no se edita a mano.
update public.arbitros_cr_cr set fide_torneo = null where clave = any('{1167290,1212209,1241286}'::int[]) or fide_torneo = any('{416271,428660,433885}'::int[]);
update public.arbitros_cr_cr c set fide_torneo = v.fide from (values
  (1167290, 416271),
  (1212209, 428660),
  (1241286, 433885)
) v(clave, fide) where c.clave = v.clave;
