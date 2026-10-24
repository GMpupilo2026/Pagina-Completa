-- «Seguir a toda la delegación» en centroamericano-2026.html: un aparato puede
-- pedir, además de (o en vez de) sus jugadores, el resumen de un país en cada
-- ronda («CRC · Ronda 4: 9 ganadas, 3 en tablas, 2 perdidas»), pensado para
-- jefes de delegación y entrenadores. Lo pidió el dueño del sitio.
--
-- Se guarda solo el código de FIDE del país (tres letras): ningún dato de
-- nadie. La lista de jugadores puede quedar vacía si sigue a un país.
--
-- Ver «Seguir a mis jugadores y los avisos en el celular» en
-- docs/decisiones/juegos-y-torneos.md.

alter table public.sala_suscripciones_push
  add column delegacion text check (delegacion ~ '^[A-Z]{3}$');

alter table public.sala_suscripciones_push drop constraint sala_suscripciones_push_jugadores_check;
alter table public.sala_suscripciones_push add constraint sala_suscripciones_push_jugadores_check
  check (jsonb_typeof(jugadores) = 'array' and jsonb_array_length(jugadores) between 0 and 20
         and (jsonb_array_length(jugadores) > 0 or delegacion is not null));

-- El resumen del país se anota como los demás avisos, uno por aparato, torneo y ronda.
alter table public.sala_avisos_push_enviados drop constraint sala_avisos_push_enviados_tipo_check;
alter table public.sala_avisos_push_enviados add constraint sala_avisos_push_enviados_tipo_check
  check (tipo in ('pareo', 'resultado', 'recordatorio', 'delegacion'));
alter table public.sala_avisos_push_enviados drop constraint sala_avisos_push_enviados_no_check;
alter table public.sala_avisos_push_enviados add constraint sala_avisos_push_enviados_no_check
  check (no > 0 or (tipo in ('recordatorio', 'delegacion') and no = 0));
