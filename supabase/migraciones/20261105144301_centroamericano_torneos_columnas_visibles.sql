-- La tabla da SELECT columna por columna (clave_puesta_por no se lee desde afuera). Las cuatro columnas que agregó
-- «Fair Play para todos los torneos» (evento, ritmo, menores, archivado) quedaron sin permiso, y la organización
-- (centroamericano-mesas.html), que ya las pide, recibía «permission denied for table centroamericano_torneos» y
-- no mostraba ningún torneo ni enlace. No son secretas: se leen igual que las demás.
grant select (evento, ritmo, menores, archivado) on public.centroamericano_torneos to authenticated;
