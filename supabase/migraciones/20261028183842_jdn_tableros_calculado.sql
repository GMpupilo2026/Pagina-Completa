-- «Resultados JDN por comité»: los mejores tableros de las finales 2011-2017.
--
-- chess-results no publica la «Clasificación por tableros» (art=81) de las
-- finales por equipos de 2011 a 2017. El dueño pidió contarlos igual, con la
-- regla de las finales 2018 («los desempates son los mismos todos los
-- años»): por porcentaje, después puntos y rendimiento; mínimo el 57 % de
-- las rondas (42 % en el tablero de reserva, el 5); cada jugador en su
-- tablero de la alineación. Esas filas no son el orden oficial de chess-
-- results sino uno calculado acá, y la página tiene que decirlo: por eso la
-- columna. Las de 2018 en adelante siguen siendo las de chess-results
-- (calculado = false). Lo carga herramientas/jdn-comites/cargar-tableros-calculados.sql.
-- Ver «Las finales y eliminatorias de 2011 a 2017» en
-- docs/decisiones/juegos-y-torneos.md.

alter table public.jdn_tableros add column calculado boolean not null default false;
comment on column public.jdn_tableros.calculado is
  'true: el puesto no sale de chess-results (que no publica la clasificación por tableros de las finales 2011-2017) sino de cargar-tableros-calculados.sql, con la regla de las finales 2018.';
