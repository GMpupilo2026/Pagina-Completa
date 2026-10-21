-- Las tablas y funciones temporales de la carga de torneos universitarios del
-- 15/10/2026, que quedaron en `interno` sin venir de ninguna migración:
--   interno.uni_carga_tmp, uni_cat_tmp y uni_paginas_tmp: copias de las
--   páginas de chess-results pedidas con pg_net (net._http_response se vacía
--   sola a las horas);
--   interno.uni_tmp_equipos, uni_tmp_individual y uni_tmp_partidas: los
--   archivos de herramientas/jdn-comites/ adaptados para leer de esas copias.
-- Lo que cargaron ya está en uni_resultados, uni_jugadores, uni_partidas,
-- uni_torneos y uni_clasificacion. Nada las usaba (ni funciones, ni vistas, ni
-- el cron, ni el repositorio) y solo postgres las podía leer. Para volver a
-- cargar, los pasos están en la cabecera de herramientas/universidades/cargar.sql.
-- Con `if exists`: en una base armada desde las migraciones nunca existieron.
-- Ver «Las tablas temporales de la carga universitaria» en
-- docs/decisiones/juegos-y-torneos.md.

drop function if exists interno.uni_tmp_equipos(integer, integer);
drop function if exists interno.uni_tmp_individual(integer, integer);
drop function if exists interno.uni_tmp_partidas(integer, integer);
drop table if exists interno.uni_carga_tmp;
drop table if exists interno.uni_cat_tmp;
drop table if exists interno.uni_paginas_tmp;