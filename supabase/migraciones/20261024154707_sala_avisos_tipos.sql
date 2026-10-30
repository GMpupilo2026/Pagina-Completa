-- Los avisos de «Avisarme en este celular» (centroamericano-2026.html) ya no
-- son solo el pareo: también el resultado de cada seguido, cuando
-- chess-results lo anota, y un recordatorio 30 minutos antes de cada ronda.
-- Lo pidió el dueño del sitio.
--
-- sala_avisos_push_enviados anota cada aviso ANTES de mandarlo para que no
-- salga dos veces; ahora la clave lleva su tipo. El recordatorio es uno por
-- aparato y ronda, no por jugador: se anota con tnr '0' y no 0.
--
-- Ver «Seguir a mis jugadores y los avisos en el celular» en
-- docs/decisiones/juegos-y-torneos.md.

alter table public.sala_avisos_push_enviados
  add column tipo text not null default 'pareo' check (tipo in ('pareo', 'resultado', 'recordatorio'));

alter table public.sala_avisos_push_enviados drop constraint sala_avisos_push_enviados_pkey;
alter table public.sala_avisos_push_enviados add primary key (suscripcion_id, tipo, tnr, no, ronda);

alter table public.sala_avisos_push_enviados drop constraint sala_avisos_push_enviados_no_check;
alter table public.sala_avisos_push_enviados add constraint sala_avisos_push_enviados_no_check
  check (no > 0 or (tipo = 'recordatorio' and no = 0));