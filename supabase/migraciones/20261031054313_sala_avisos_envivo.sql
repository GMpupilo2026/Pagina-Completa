-- El aviso «su partida está en vivo» (sala-jugadores, revisar): cuando la
-- partida de un jugador que alguien sigue empieza en un tablero que Lichess
-- transmite, ese aparato recibe un aviso que abre la partida en la página.
-- Una vez por jugador y por ronda, como el pareo y el resultado: tipo
-- «envivo», con el tnr y el número del jugador. Ver «Su partida está en vivo:
-- el aviso al celular» en docs/decisiones/juegos-y-torneos.md.
alter table public.sala_avisos_push_enviados drop constraint sala_avisos_push_enviados_tipo_check;
alter table public.sala_avisos_push_enviados add constraint sala_avisos_push_enviados_tipo_check
  check (tipo in ('pareo', 'resultado', 'envivo', 'recordatorio', 'delegacion', 'anuncio'));
