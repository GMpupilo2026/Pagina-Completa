-- «Ganar con poco» suma el capítulo de las partidas del libro: 18 lecciones
-- más, 44 en total. El certificado se da al terminar las 44.
insert into interno.curso_lecciones (slug, titulo, total) values
  ('ganar-con-poco',            'Ganar con poco',                        44)
on conflict (slug) do update set titulo = excluded.titulo, total = excluded.total;
