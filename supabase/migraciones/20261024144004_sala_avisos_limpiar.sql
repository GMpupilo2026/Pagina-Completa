-- Las suscripciones de «Avisarme en este celular» (centroamericano-2026.html)
-- no se guardan para siempre: se borran solas 30 días después del último
-- cambio (el alta o la última vez que la página mandó la lista), y con ellas
-- lo anotado en sala_avisos_push_enviados (on delete cascade). Pasado el
-- festival ya no sirven para nada. Es lo que promete privacidad.html#torneos.
--
-- Ver «Seguir a mis jugadores y los avisos en el celular» en
-- docs/decisiones/juegos-y-torneos.md.

select cron.schedule('sala-avisos-limpiar', '17 9 * * *',
  $$delete from public.sala_suscripciones_push where actualizada < now() - interval '30 days'$$);