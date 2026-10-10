-- «Resultados JDN por comité», por ahora gratis y sin cuenta (lo pidió el
-- dueño: «que no tenga licencia por ahora»). jdn-comites.html pasa a ser una
-- página pública, como «Ajedrez estudiantil en Costa Rica», y la tabla se lee
-- sin sesión: son resultados que ya publicó chess-results.
--
-- La política con licencia (jdn_resultados_con_herramienta) se queda: las
-- políticas permisivas se suman, así que con esta basta para que lea
-- cualquiera. Para volver a cobrarla: borrar esta política, quitarle el select
-- a anon y devolver la página a la Academia. Ver «Resultados JDN por comité»
-- en docs/decisiones/juegos-y-torneos.md.

grant select on public.jdn_resultados to anon;

create policy jdn_resultados_lectura_publica on public.jdn_resultados
  for select to anon, authenticated
  using (true);