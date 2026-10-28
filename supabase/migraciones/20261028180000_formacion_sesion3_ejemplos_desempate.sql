-- Formación Ajedrez, Sesión 3: entran cinco láminas de ejemplos de desempate
-- resueltos (un suizo de 7 con ronda libre y un todos contra todos con tres
-- empatados) después de «Sonneborn-Berger y encuentro directo», y el receso se
-- corre detrás de ellas. Desde la lámina 10 todo se corre 5 lugares: la
-- práctica pasa de las láminas 41 a 50 a las 46 a 55.
--
-- Las claves van por número de lámina, así que se borran las de la Sesión 3 y
-- se vuelven a sembrar con los números nuevos (el mismo contenido que da
-- node herramientas/formacion-practicas.js --sql). Las respuestas cuelgan de
-- las claves con on delete cascade: borrar una clave con respuestas las
-- borraría. Por eso la migración se niega si hay alguna respuesta de esta
-- práctica (al aplicarla no había ninguna, ni una clase que la usara); con
-- respuestas habría que correrlas junto con sus claves.
-- Ver «Las prácticas de Formación Ajedrez en la clase» en
-- docs/decisiones/clase-en-vivo.md.

do $$
begin
  if exists (select 1 from public.practica_respuestas where deck = 'formacion-ajedrez/clase-03') then
    raise exception 'Hay respuestas guardadas de la práctica de la Sesión 3: correrlas junto con sus claves antes de renumerar';
  end if;
end $$;

delete from public.practica_claves where deck = 'formacion-ajedrez/clase-03';

insert into public.practica_claves (deck, lamina, pregunta, tipo, clave, modelo) values
  ('formacion-ajedrez/clase-03', 47, 'respuesta', 'texto', null, 'a) 10 minutos: relámpago (10 o menos). b) 10 + 5 = 15: rápidas. c) 25 + 10 = 35: rápidas. d) 60: clásico.'),
  ('formacion-ajedrez/clase-03', 48, 'respuesta', 'texto', null, 'A: venció a C (3), D (2½) y F (1) = 6½, más la mitad de B (3½) = 1¾. Total 8¼. B: venció a D (2½), E (1½) y F (1) = 5, más la mitad de A = 1¾. Total 6¾. Queda primero A. (El encuentro directo no los separaba: empataron entre sí.)'),
  ('formacion-ajedrez/clase-03', 49, 'respuesta', 'texto', null, 'Carla: Buchholz 12½; corte 1 (se quita ½) = 12. Diego: Buchholz 13; corte 1 (se quita 1) = 12. Si el primer desempate es Buchholz, gana Diego; si fuera Buchholz con corte 1, siguen empatados y se pasa al siguiente criterio.'),
  ('formacion-ajedrez/clase-03', 50, 'respuesta', 'texto', null, 'Suizo de al menos cinco rondas, con un ritmo mínimo de 10 min + 2 s (66.2.a); al menos dos frente al tablero (66.2.f); la persona árbitra principal, en el congresillo, con al menos tres criterios (66.4); hasta que su reloj caiga a cero (art. 30).'),
  ('formacion-ajedrez/clase-03', 51, 'respuesta', 'texto', null, 'La Normativa prevé suizo con más de siete y todos contra todos con seis o menos (66.2.d y 66.2.e): no dice nada para exactamente siete. La persona árbitra principal lo plantea en el congresillo y deja el acuerdo escrito en el acta, que obliga a todas las delegaciones (art. 34).'),
  ('formacion-ajedrez/clase-03', 52, 'respuesta', 'texto', null, '1–7, 8–2, 3–9, 10–4, 5–11, 12–6 (el primero de cada pareja lleva blancas).'),
  ('formacion-ajedrez/clase-03', 53, 'respuesta', 'texto', null, '10 jugadores: 9 rondas y 45 partidas. 9 jugadores: se agrega un descanso, 9 rondas y 36 partidas, con un jugador libre por ronda.'),
  ('formacion-ajedrez/clase-03', 54, 'respuesta', 'texto', null, 'Ronda 1: 1–4, 2–3. Ronda 2: 4–3, 1–2. Ronda 3: 2–4, 3–1 (el primero de cada pareja lleva blancas).'),
  ('formacion-ajedrez/clase-03', 55, 'respuesta', 'texto', null, 'Un jugador queda libre (bye) y recibe un punto sin color. No puede recibirlo quien ya lo tuvo ni quien ya ganó por incomparecencia.')
on conflict (deck, lamina, pregunta) do update
  set tipo = excluded.tipo, clave = excluded.clave, modelo = excluded.modelo;
