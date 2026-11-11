-- Formación Ajedrez, Sesión 4: la práctica suma el ritmo mínimo de la Etapa
-- Regional de los JDE (10 min + 2 s, Normativa JDE 2026, art. 66.2.a) como
-- ejercicio 4 de 6, y la respuesta del 3 (3 min + 2 s) dice que es el blitz
-- de la Etapa Nacional. Las láminas 22 a 24 corren uno: 22 es el ejercicio
-- nuevo, 23 la bandera y 24 la incomparecencia. Solo las filas de la Sesión 4,
-- con el mismo upsert del generador (node herramientas/formacion-practicas.js --sql).

insert into public.practica_claves (deck, lamina, pregunta, tipo, clave, modelo) values
  ('formacion-ajedrez/clase-04', 19, 'respuesta', 'texto', null, 'Tiempo base 90:00 e incremento de 30 s por jugada, en ambos lados. Sí: con incremento de 30 segundos o más no se puede dejar de anotar (art. 8.4).'),
  ('formacion-ajedrez/clase-04', 20, 'respuesta', 'texto', null, 'Tiempo base 15:00 e incremento de 10 s. 15 + 10 = 25 minutos: rápidas.'),
  ('formacion-ajedrez/clase-04', 21, 'respuesta', 'texto', null, 'Tiempo base 3:00 e incremento de 2 s. 3 + 2 = 5 minutos: relámpago. Es el blitz de la Etapa Nacional de los JDE (Normativa JDE 2026, art. 66.2).'),
  ('formacion-ajedrez/clase-04', 22, 'respuesta', 'texto', null, 'Tiempo base 10:00 e incremento de 2 s, en ambos lados. 10 + 2 = 12 minutos: rápidas, así que rige el apéndice A; por ejemplo, la primera jugada ilegal le suma 1 minuto al rival, no 2 (Normativa JDE 2026, art. 66.2.a; Leyes del Ajedrez, A.3).'),
  ('formacion-ajedrez/clase-04', 23, 'respuesta', 'texto', null, 'Tablas: el rival no puede dar mate por ninguna serie de jugadas legales (art. 6.9).'),
  ('formacion-ajedrez/clase-04', 24, 'respuesta', 'texto', null, 'El tiempo de incomparecencia es cero: pierde, salvo que el árbitro decida otra cosa en ese caso puntual (art. 6.7).')
on conflict (deck, lamina, pregunta) do update
  set tipo = excluded.tipo, clave = excluded.clave, modelo = excluded.modelo;
