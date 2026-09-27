-- El comentarista en video de una sala de torneo.
--
-- La sala de cine (transmision.html) puede llevar, al lado de la pantalla
-- grande, el video de quien comenta el torneo en vivo: un enlace de YouTube o
-- de Twitch que carga quien administra en admin.html#torneos. La página lo
-- convierte en el reproductor con js/video-embebido.js (la misma que ya usa la
-- TV).
--
-- Solo YouTube y Twitch, y así lo exige la base: son los dos que la CSP deja
-- incrustar (frame-src), y un enlace de otro sitio en una página pública no
-- puede depender de que el formulario lo haya revisado.
--
-- Ver «El comentarista en video» en docs/decisiones/juegos-y-torneos.md.

alter table public.salas_torneo
  add column video_url text
  check (video_url is null
         or (char_length(video_url) <= 300
             and video_url ~ '^https://((www|m)\.)?(youtube\.com|youtu\.be|twitch\.tv)/[^\s"<>]*$'));