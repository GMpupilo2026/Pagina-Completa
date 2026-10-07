-- El curso «Las mil y una lecciones de ajedrez» se quedó con el slug
-- «las-mil-y-una-lecciones-de-ajedrez»: el correo a la casa nombra un curso que
-- no está en su tabla desde el slug, y ese da justo el título del catálogo (con
-- «mil-y-una-lecciones» decía «Mil y una lecciones»). Nadie lo había empezado.
update interno.curso_lecciones set slug = 'las-mil-y-una-lecciones-de-ajedrez' where slug = 'mil-y-una-lecciones';
