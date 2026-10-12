-- Formación Ajedrez pasa de 8 a 7 sesiones (6 virtuales de 4 horas y la
-- presencial del 14 de diciembre): las sesiones 3 y 4 se juntaron en una. Sin
-- esto, nadie podría completar el curso para recibir su certificado.
insert into interno.curso_lecciones (slug, titulo, total) values
  ('formacion-ajedrez', 'Formación Ajedrez', 7)
on conflict (slug) do update set titulo = excluded.titulo, total = excluded.total;
