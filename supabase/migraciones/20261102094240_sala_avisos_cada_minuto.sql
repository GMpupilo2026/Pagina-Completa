-- Los avisos del Centroamericano: la base revisa chess-results cada minuto,
-- no cada 5. Lo pidió el dueño del sitio el 2/11/2026: que el aviso del pareo
-- llegue en el momento en que sale la ronda. Con 5 minutos (y lo leído
-- guardado 90 s en pizarras_cache) llegaba hasta unos 6 minutos tarde; ahora
-- la función guarda lo leído 50 s, así que cada vuelta lee chess-results de
-- nuevo y el aviso sale a más tardar un minuto después.
--
-- Dos vueltas que se pisen no mandan nada dos veces: cada aviso se anota
-- antes de salir en sala_avisos_push_enviados, cuya clave primaria lo impide.
-- Sin nadie suscrito, disparar_sala_avisos() ni llama a la función.
--
-- Mismas fechas que antes: del 1 al 8 de noviembre (UTC). Ver «Seguir a mis
-- jugadores y los avisos en el celular» en docs/decisiones/juegos-y-torneos.md.

select cron.alter_job(
  (select jobid from cron.job where jobname = 'sala-avisos'),
  schedule := '* * 1-8 11 *'
);
