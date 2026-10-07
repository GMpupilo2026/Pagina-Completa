-- Curso nuevo «Rompe el estancamiento» (36 lecciones): la base tiene que saber
-- cuántas lecciones tiene para poder dar su certificado al terminarlo (ver
-- «Los certificados de curso» en docs/decisiones/cursos-y-material.md).
insert into interno.curso_lecciones (slug, titulo, total) values
  ('rompe-el-estancamiento',    'Rompe el estancamiento',                36)
on conflict (slug) do update set titulo = excluded.titulo, total = excluded.total;
