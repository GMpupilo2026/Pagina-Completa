-- El dictado pasa a ser lo primero de la práctica de la Sesión 1 (herramientas/formacion-practicas.js):
-- láminas 1 (dictado), 2 y 3 (las ocho posiciones), 4 a 6 (los reclamos) y 7 a 10 (los casos).
-- Antes: 1 y 2 posiciones, 3 dictado. Se renumeran las claves en dos pasos (la llave primaria
-- no admite que dos filas se crucen en el mismo UPDATE) y después se vuelven a sembrar las claves
-- de esta práctica, que dejan cada una igual a lo que arma el generador (las de las demás
-- sesiones no cambian). Nadie había contestado
-- todavía (practica_respuestas vacía): ninguna respuesta se pierde ni queda en otra lámina.
update public.practica_claves set lamina = lamina + 100
 where deck = 'formacion-ajedrez/practica-01';
update public.practica_claves set lamina = case
    when pregunta = 'planilla' then 1
    when pregunta in ('p1', 'p2', 'p3', 'p4') then 2
    when pregunta in ('p5', 'p6', 'p7', 'p8') then 3
    else lamina - 100 end
 where deck = 'formacion-ajedrez/practica-01';

insert into public.practica_claves (deck, lamina, pregunta, tipo, clave, modelo) values
  ('formacion-ajedrez/practica-01', 1, 'planilla', 'planilla', '["e4","e5","Cf3","d6","Ac4","Ag4","Cc3","g6","Cxe5","Axd1","Axf7+","Re7","Cd5#"]'::jsonb, 'La partida dictada: 1. e4 e5 2. Cf3 d6 3. Ac4 Ag4 4. Cc3 g6 5. Cxe5 Axd1 6. Axf7+ Re7 7. Cd5#'),
  ('formacion-ajedrez/practica-01', 2, 'p1', 'opciones', '{"correcta":"mate"}'::jsonb, 'Jaque mate: el rey está en jaque y no tiene ninguna jugada legal. La partida terminó (art. 5.1).'),
  ('formacion-ajedrez/practica-01', 2, 'p2', 'opciones', '{"correcta":"ahogado"}'::jsonb, 'Ahogado: el rey no está en jaque y el bando que mueve no tiene ninguna jugada legal. Tablas (art. 5.2.1).'),
  ('formacion-ajedrez/practica-01', 2, 'p3', 'opciones', '{"correcta":"jaque"}'::jsonb, 'Jaque, pero no mate: el rey tiene al menos una jugada legal para salir del jaque. La partida sigue (art. 3.9).'),
  ('formacion-ajedrez/practica-01', 2, 'p4', 'opciones', '{"correcta":"muerta"}'::jsonb, 'Posición muerta: ninguna serie de jugadas legales puede terminar en mate. Tablas de inmediato, sin reclamo (art. 5.2.2).'),
  ('formacion-ajedrez/practica-01', 3, 'p5', 'opciones', '{"correcta":"mate"}'::jsonb, 'Jaque mate: el rey está en jaque y no tiene ninguna jugada legal. La partida terminó (art. 5.1).'),
  ('formacion-ajedrez/practica-01', 3, 'p6', 'opciones', '{"correcta":"muerta"}'::jsonb, 'Posición muerta: ninguna serie de jugadas legales puede terminar en mate. Tablas de inmediato, sin reclamo (art. 5.2.2).'),
  ('formacion-ajedrez/practica-01', 3, 'p7', 'opciones', '{"correcta":"sigue"}'::jsonb, 'No hay jaque y sí hay material para dar mate: la partida sigue.'),
  ('formacion-ajedrez/practica-01', 3, 'p8', 'opciones', '{"correcta":"ahogado"}'::jsonb, 'Ahogado: el rey no está en jaque y el bando que mueve no tiene ninguna jugada legal. Tablas (art. 5.2.1).'),
  ('formacion-ajedrez/practica-01', 4, 'decision', 'texto', null, 'Pieza tocada: debe mover el alfil si tiene una jugada legal (art. 4.3).'),
  ('formacion-ajedrez/practica-01', 5, 'decision', 'texto', null, 'Jugada ilegal: se vuelve a la posición anterior, juega con la pieza que tocó si tiene jugada legal y su rival recibe 2 minutos (art. 7.5).'),
  ('formacion-ajedrez/practica-01', 6, 'decision', 'texto', null, 'Pieza tocada: «compongo» solo vale en su turno y avisando antes de tocar la pieza (art. 4.2.1).'),
  ('formacion-ajedrez/practica-01', 7, 'decision', 'texto', null, 'Aplica pieza tocada: como tocó primero la torre, debe mover esa torre y no puede enrocar con ella. El enroque se hace tocando primero el rey. (Leyes del Ajedrez 2023 (Handbook E.I.01), art. 4.4.2)'),
  ('formacion-ajedrez/practica-01', 8, 'decision', 'texto', null, 'Es una jugada ilegal completada: el cambio del peón es parte de la misma jugada. No se repone la posición: el peón se cambia por una dama del mismo color y se aplica la sanción de la primera jugada ilegal (dos minutos más para el rival en ritmo clásico, uno en rápidas y relámpago). (Leyes del Ajedrez 2023 (Handbook E.I.01), art. 3.7.5, 7.5.2 y 7.5.5)'),
  ('formacion-ajedrez/practica-01', 9, 'decision', 'texto', null, 'La partida terminó en tablas en el momento en que se llegó a esa posición: es posición muerta y no hace falta ningún reclamo. (Leyes del Ajedrez 2023 (Handbook E.I.01), art. 5.2.2)'),
  ('formacion-ajedrez/practica-01', 10, 'decision', 'texto', null, 'Es una jugada ilegal: el derecho a capturar al paso solo existe en la respuesta inmediata al avance doble. (Leyes del Ajedrez 2023 (Handbook E.I.01), art. 3.7.4.1 y 7.5)')
on conflict (deck, lamina, pregunta) do update
  set tipo = excluded.tipo, clave = excluded.clave, modelo = excluded.modelo;
