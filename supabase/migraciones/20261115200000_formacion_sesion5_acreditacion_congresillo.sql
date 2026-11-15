-- Formación Ajedrez, Sesión 5: entran ocho láminas después de «Logística antes
-- del torneo» (la Boleta Oficial y la acreditación, sus requisitos, los ocho
-- documentos del estudiante, qué pasa si falta, el congresillo técnico, qué se
-- revisa en cada congresillo, qué se puede y qué no, y cómo calcular los
-- materiales), con la Normativa PJDE 2026. Desde el primer receso todo se
-- corre 8 lugares: los ejercicios de la práctica pasan de las láminas 18 a 20
-- a las 26 a 28.
--
-- Las claves van por número de lámina, así que se borran las de la Sesión 5 y
-- se vuelven a sembrar con los números nuevos (el mismo contenido que da
-- node herramientas/formacion-practicas.js --sql; la respuesta del ejercicio 2
-- ahora cuenta mesas dobles). Las respuestas cuelgan de las claves con
-- on delete cascade: borrar una clave con respuestas las borraría. Por eso la
-- migración se niega si hay alguna respuesta de esta práctica.
-- Ver «Las prácticas de Formación Ajedrez en la clase» en
-- docs/decisiones/clase-en-vivo.md.

do $$
begin
  if exists (select 1 from public.practica_respuestas where deck = 'formacion-ajedrez/clase-05') then
    raise exception 'Hay respuestas guardadas de la práctica de la Sesión 5: correrlas junto con sus claves antes de renumerar';
  end if;
end $$;

delete from public.practica_claves where deck = 'formacion-ajedrez/clase-05';

insert into public.practica_claves (deck, lamina, pregunta, tipo, clave, modelo) values
  ('formacion-ajedrez/clase-05', 26, 'respuesta', 'texto', null, 'Hechos: suena el celular del jugador X en la mesa N, ronda R, a tal hora. Artículo: 11.3.2 y el reglamento del torneo. Decisión: pérdida de la partida (o la sanción menor que prevea el reglamento), comunicada a las dos partes. Registro: «Ronda R, mesa N: suena el celular del jugador X durante la partida; se aplica el art. 11.3.2 y se declara la partida perdida. Firma del árbitro».'),
  ('formacion-ajedrez/clase-05', 27, 'respuesta', 'texto', null, '20 partidas por ronda: 10 mesas dobles y 40 sillas; 20 tableros y 20 juegos de piezas completos, más 2 de repuesto; 20 relojes configurados, más 2 de repuesto; planillas para cada ronda; actas de resultados; formularios de inscripción; lista de cotejo; numeración de mesas; hojas de emparejamiento y tabla para publicar.'),
  ('formacion-ajedrez/clase-05', 28, 'respuesta', 'texto', null, 'Nadie puede comentar ni interferir en una partida en curso. Se retira al familiar de la zona de juego y se evalúa si hubo ayuda: si la hubo, se sanciona a la jugadora según el art. 12.9. Se registra la incidencia (art. 11.3.1 y 12.7).')
on conflict (deck, lamina, pregunta) do update
  set tipo = excluded.tipo, clave = excluded.clave, modelo = excluded.modelo;
