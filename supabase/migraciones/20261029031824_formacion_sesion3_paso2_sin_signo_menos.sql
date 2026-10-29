-- Formación Ajedrez, Sesión 3: la respuesta modelo del paso 2 del todos contra
-- todos decía «n − 1» con el signo menos tipográfico, que las letras base de
-- los PDF no tienen (verificar-formacion.js lo marca); ahora lo dice con
-- palabras. Solo esa fila, con el mismo upsert del generador.

insert into public.practica_claves (deck, lamina, pregunta, tipo, clave, modelo) values
  ('formacion-ajedrez/clase-03', 57, 'opcion', 'opciones', '{"correcta":"d"}'::jsonb, '5 rondas (6 jugadores menos 1) y 15 partidas (6 × 5 ÷ 2).')
on conflict (deck, lamina, pregunta) do update
  set tipo = excluded.tipo, clave = excluded.clave, modelo = excluded.modelo;
