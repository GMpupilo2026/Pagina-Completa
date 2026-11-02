-- Torneos de PRUEBA del Centroamericano: se marcan para que la organización los vea aparte de los reales.
--
-- Los dos torneos de prueba (PRUEBA grupo A y B) son torneos de chess-results distintos de los 12 reales, así que
-- probar con ellos no escribe nada en un torneo real. Lo que sí pasaba es que sus enlaces, avisos, ausentes, planillas
-- y registro salían MEZCLADOS con los reales en las listas de la organización (resumen, «no han llegado», hojas en
-- papel, informe final). `prueba` los separa: la página de la organización muestra solo los reales, y los de prueba
-- solo en «Modo ensayo».

alter table public.centroamericano_torneos add column prueba boolean not null default false;
comment on column public.centroamericano_torneos.prueba is
  'true = torneo de ensayo: la organización lo ve solo en «Modo ensayo» y no se mezcla con los reales.';
grant select (prueba) on public.centroamericano_torneos to authenticated;
update public.centroamericano_torneos set prueba = true where tnr in ('1532448', '1532486');
