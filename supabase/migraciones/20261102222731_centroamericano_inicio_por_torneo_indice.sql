-- La clave foránea de centroamericano_inicios_torneo.asignacion_id lleva su índice (como las demás tablas del Centroamericano):
-- sin él, borrar un enlace recorre la tabla entera.
create index centroamericano_inicios_torneo_asignacion_idx on public.centroamericano_inicios_torneo (asignacion_id);
