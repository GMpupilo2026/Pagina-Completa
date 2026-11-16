do $$
begin
  if exists (select 1 from public.practica_respuestas where deck = 'formacion-ajedrez/clase-05') then
    raise exception 'Hay respuestas guardadas de la práctica de la Sesión 5: correrlas junto con sus claves antes de renumerar';
  end if;
end $$;

delete from public.practica_claves where deck = 'formacion-ajedrez/clase-05';

insert into public.practica_claves (deck, lamina, pregunta, tipo, clave, modelo) values
  ('formacion-ajedrez/clase-05', 30, 'respuesta', 'texto', null, 'Hechos: suena el celular del jugador X en la mesa N, ronda R, a tal hora. Artículo: 11.3.2 y el reglamento del torneo. Decisión: pérdida de la partida (o la sanción menor que prevea el reglamento), comunicada a las dos partes. Registro: «Ronda R, mesa N: suena el celular del jugador X durante la partida; se aplica el art. 11.3.2 y se declara la partida perdida. Firma del árbitro».'),
  ('formacion-ajedrez/clase-05', 31, 'respuesta', 'texto', null, '20 partidas por ronda: 10 mesas dobles y 40 sillas; 20 tableros y 20 juegos de piezas completos, más 2 de repuesto; 20 relojes configurados, más 2 de repuesto; planillas para cada ronda; actas de resultados; formularios de inscripción; lista de cotejo; numeración de mesas; hojas de emparejamiento y tabla para publicar.'),
  ('formacion-ajedrez/clase-05', 32, 'respuesta', 'texto', null, 'Nadie puede comentar ni interferir en una partida en curso. Se retira al familiar de la zona de juego y se evalúa si hubo ayuda: si la hubo, se sanciona a la jugadora según el art. 12.9. Se registra la incidencia (art. 11.3.1 y 12.7).')
on conflict (deck, lamina, pregunta) do update
  set tipo = excluded.tipo, clave = excluded.clave, modelo = excluded.modelo;