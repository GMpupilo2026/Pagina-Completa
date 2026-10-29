-- Formación Ajedrez, Sesión 3: la práctica suma ocho pasos para elegir cómo se
-- acomodan los números de un todos contra todos de 6 (ejercicios 10 a 17,
-- láminas 56 a 63, de opciones: la correcta va acá y la corrige
-- responder_practica()). Las láminas 46 a 55 no se mueven: solo cambia la
-- respuesta modelo del ejercicio 1, porque el curso pasó a contar los 10
-- minutos justos como rápidas.
--
-- Es el upsert que da node herramientas/formacion-practicas.js --sql para la
-- Sesión 3: no borra nada, así que las respuestas ya guardadas siguen en su
-- lámina. Ver «Los desempates, con ejemplos resueltos» en
-- docs/decisiones/clase-en-vivo.md.

insert into public.practica_claves (deck, lamina, pregunta, tipo, clave, modelo) values
  ('formacion-ajedrez/clase-03', 47, 'respuesta', 'texto', null, 'a) 10 minutos: rápidas (de 10 a menos de 60). b) 10 + 5 = 15: rápidas. c) 25 + 10 = 35: rápidas. d) 60: clásico.'),
  ('formacion-ajedrez/clase-03', 48, 'respuesta', 'texto', null, 'A: venció a C (3), D (2½) y F (1) = 6½, más la mitad de B (3½) = 1¾. Total 8¼. B: venció a D (2½), E (1½) y F (1) = 5, más la mitad de A = 1¾. Total 6¾. Queda primero A. (El encuentro directo no los separaba: empataron entre sí.)'),
  ('formacion-ajedrez/clase-03', 49, 'respuesta', 'texto', null, 'Carla: Buchholz 12½; corte 1 (se quita ½) = 12. Diego: Buchholz 13; corte 1 (se quita 1) = 12. Si el primer desempate es Buchholz, gana Diego; si fuera Buchholz con corte 1, siguen empatados y se pasa al siguiente criterio.'),
  ('formacion-ajedrez/clase-03', 50, 'respuesta', 'texto', null, 'Suizo de al menos cinco rondas, con un ritmo mínimo de 10 min + 2 s (66.2.a); al menos dos frente al tablero (66.2.f); la persona árbitra principal, en el congresillo, con al menos tres criterios (66.4); hasta que su reloj caiga a cero (art. 30).'),
  ('formacion-ajedrez/clase-03', 51, 'respuesta', 'texto', null, 'La Normativa prevé suizo con más de siete y todos contra todos con seis o menos (66.2.d y 66.2.e): no dice nada para exactamente siete. La persona árbitra principal lo plantea en el congresillo y deja el acuerdo escrito en el acta, que obliga a todas las delegaciones (art. 34).'),
  ('formacion-ajedrez/clase-03', 52, 'respuesta', 'texto', null, '1–7, 8–2, 3–9, 10–4, 5–11, 12–6 (el primero de cada pareja lleva blancas).'),
  ('formacion-ajedrez/clase-03', 53, 'respuesta', 'texto', null, '10 jugadores: 9 rondas y 45 partidas. 9 jugadores: se agrega un descanso, 9 rondas y 36 partidas, con un jugador libre por ronda.'),
  ('formacion-ajedrez/clase-03', 54, 'respuesta', 'texto', null, 'Ronda 1: 1–4, 2–3. Ronda 2: 4–3, 1–2. Ronda 3: 2–4, 3–1 (el primero de cada pareja lleva blancas).'),
  ('formacion-ajedrez/clase-03', 55, 'respuesta', 'texto', null, 'Un jugador queda libre (bye) y recibe un punto sin color. No puede recibirlo quien ya lo tuvo ni quien ya ganó por incomparecencia.'),
  ('formacion-ajedrez/clase-03', 56, 'opcion', 'opciones', '{"correcta":"b"}'::jsonb, 'Se sortean antes de empezar y cada jugador conserva su número todo el torneo: de él sale su rival y su color en cada ronda.'),
  ('formacion-ajedrez/clase-03', 57, 'opcion', 'opciones', '{"correcta":"d"}'::jsonb, '5 rondas (n − 1) y 15 partidas (6 × 5 / 2).'),
  ('formacion-ajedrez/clase-03', 58, 'opcion', 'opciones', '{"correcta":"a"}'::jsonb, 'El 6, el más alto: cambia de color cada ronda y los demás giran a su alrededor.'),
  ('formacion-ajedrez/clase-03', 59, 'opcion', 'opciones', '{"correcta":"c"}'::jsonb, '1–6, 2–5, 3–4: el 1 con el último y, hacia el centro, el 2 con el 5 y el 3 con el 4.'),
  ('formacion-ajedrez/clase-03', 60, 'opcion', 'opciones', '{"correcta":"a"}'::jsonb, '6–4: el 6 juega con blancas contra el 4. El número fijo cambia de color cada ronda.'),
  ('formacion-ajedrez/clase-03', 61, 'opcion', 'opciones', '{"correcta":"b"}'::jsonb, '6–4, 5–3, 1–2.'),
  ('formacion-ajedrez/clase-03', 62, 'opcion', 'opciones', '{"correcta":"d"}'::jsonb, '2–6, 3–1, 4–5. Siguen la ronda 4 (6–5, 1–4, 2–3) y la 5 (3–6, 4–2, 5–1).'),
  ('formacion-ajedrez/clase-03', 63, 'opcion', 'opciones', '{"correcta":"b"}'::jsonb, 'Se agrega un descanso como número 6 y se usa la misma tabla: en la ronda 1 descansa el 1, que le tocaba al 6.')
on conflict (deck, lamina, pregunta) do update
  set tipo = excluded.tipo, clave = excluded.clave, modelo = excluded.modelo;
