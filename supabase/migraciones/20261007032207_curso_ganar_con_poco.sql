-- Curso nuevo «Ganar con poco» (26 lecciones): la base tiene que saber
-- cuántas lecciones tiene para poder dar su certificado al terminarlo (ver
-- «Los certificados de curso» en docs/decisiones/cursos-y-material.md).
insert into interno.curso_lecciones (slug, titulo, total) values
  ('ganar-con-poco',            'Ganar con poco',                        26)
on conflict (slug) do update set titulo = excluded.titulo, total = excluded.total;