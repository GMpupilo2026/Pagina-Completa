-- El canal rápido de las partidas: la jugada viaja también por Broadcast.
--
-- Por la base, una jugada tarda lo que tarda guardarla más lo que tarda
-- Realtime en revisar la RLS de game_rooms para cada quien escucha
-- (postgres_changes, en un solo hilo, con todas las partidas de la
-- plataforma). Quien mueve la avisa además por un canal de Broadcast PRIVADO,
-- «sala-juego:<id de la sala>», y del otro lado se pinta como provisional
-- hasta que llega la fila guardada (js/sala-juego.js, js/estandar.js). Ver
-- «La jugada viaja por Broadcast» en docs/decisiones/juegos-y-torneos.md.
--
-- Hasta ahora ningún canal del proyecto era privado: realtime.messages no
-- tenía ninguna política, y un canal privado sin política no deja entrar a
-- nadie. Estas solo hablan de los temas «sala-juego:…»; los canales públicos
-- de siempre (Pareo Integral, las bromas, la cámara) no pasan por aquí.
--
--   · Escuchar (select): quien puede VER la sala, con la RLS de game_rooms tal
--     cual (quien juega, su profesor, administración, sus compañeros): la
--     misma gente que ya recibe la sala por postgres_changes.
--   · Mandar (insert): solo quien la JUEGA y mientras está en juego. Lo que
--     llega igual se comprueba del otro lado (legal, desde la posición que se
--     ve, la siguiente) y la base sigue mandando: un aviso inventado se borra
--     solo al no confirmarse.
--   · verificacion_en_dos_pasos, restrictiva, como toda tabla de Realtime.
--
-- El id se convierte a uuid solo si tiene forma de uuid: un tema con basura no
-- da error, da «no».

create policy sala_juego_escuchar on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) like 'sala-juego:%'
    and exists (
      select 1 from public.game_rooms g
       where g.id = case when substr((select realtime.topic()), 12) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                         then substr((select realtime.topic()), 12)::uuid end)
  );

create policy sala_juego_avisar on realtime.messages
  for insert to authenticated
  with check (
    extension = 'broadcast'
    and (select realtime.topic()) like 'sala-juego:%'
    and exists (
      select 1 from public.game_rooms g
       where g.id = case when substr((select realtime.topic()), 12) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                         then substr((select realtime.topic()), 12)::uuid end
         and g.status = 'playing'
         and (select auth.uid()) in (g.white_id, g.black_id))
  );

create policy verificacion_en_dos_pasos on realtime.messages
  as restrictive for all to authenticated
  using ((select interno.verificacion_al_dia()))
  with check ((select interno.verificacion_al_dia()));