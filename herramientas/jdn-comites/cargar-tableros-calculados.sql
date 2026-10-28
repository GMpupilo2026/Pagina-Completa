-- Llena public.jdn_tableros con los mejores tableros de las finales por
-- equipos 2011-2017, calculados acá: chess-results no publica su
-- «Clasificación por tableros» (art=81). Ver «Las finales y eliminatorias de
-- 2011 a 2017» en docs/decisiones/juegos-y-torneos.md.
--
-- Como cargar.sql, son dos pasos, porque pg_net contesta después:
--
-- 1) Pedir la composición de equipos (art=20) de las finales por equipos
--    2011-2017 (las mismas páginas que lee cargar-jugadores-equipos.sql):
--
--      select min(id), max(id) from (select net.http_get(
--               'https://s3.chess-results.com/tnr'||tnr||'.aspx?lan=2&art=20&turdet=YES&zeilen=99999',
--               timeout_milliseconds := 60000) id
--        from (select distinct tnr from public.jdn_resultados
--               where edicion between '2011-F' and '2017-F' and edicion like '%-F' and codigo ~ '-E' order by tnr) t) p;
--
-- 2) Esperar a que net.http_request_queue quede vacía y correr este archivo
--    con ese rango de pedidos en :desde y :hasta. Antes, si ya se cargó una
--    vez, borrar lo calculado («delete from public.jdn_tableros where
--    calculado»), en una consulta aparte: en la misma, el insert puede chocar
--    con las filas que el delete todavía no sacó. Las de chess-results (2018
--    en adelante) no se tocan.
--
-- Se lee la composición y no jdn_jugadores porque chess-results, en la
-- composición y en su clasificación por tableros, cuenta como partida la
-- ganada o perdida por incomparecencia («+», «-»), y jdn_jugadores solo las
-- jugadas (para el rendimiento contra el Elo). Con las jugadas, Kristel
-- Jiménez (final 2015, U16 femenino blitz, reserva) quedaba con 2 partidas
-- de 7 y afuera del mínimo; en chess-results tiene 3 de 3.
--
-- La regla es la de las finales 2018, que el dueño pidió usar para todas
-- («los desempates son los mismos todos los años»):
--   · cada jugador cuenta en su tablero de la alineación («M.»), con sus
--     puntos («Pts.») y sus partidas («Partidas») de la composición;
--   · entra quien jugó al menos el 57 % de las rondas del torneo (42 % en el
--     tablero de reserva, el 5), redondeado hacia arriba: «at least 57/42
--     games» en la configuración de las finales 2018-2021. Las rondas son
--     las columnas numeradas de la composición;
--   · el orden: porcentaje (puntos / partidas), después puntos y después el
--     rendimiento, el Elo medio de sus rivales («Elo medio») más la
--     diferencia que da el porcentaje (la curva de FIDE, 0 % y 100 % a ±800);
--   · si dos empatan en las tres cosas, el de abajo queda con el puesto vacío,
--     que en jdn_tableros quiere decir «empatado con el de arriba».
-- Comprobado al cargar: 44 torneos, 212 tableros y las mismas 633 medallas
-- (oro, plata y bronce de cada tablero) que el cálculo mandado en imagen.

with pag as (
  select substring(r.content from 'tnr(\d+)\.aspx')::int tnr, substr(r.content, strpos(r.content, '<table class="CRs1"')) html
    from net._http_response r where r.id between :desde and :hasta and r.status_code = 200
     and r.content like '%Información de jugadores%'),
torneo as (
  select distinct tnr, edicion, codigo from public.jdn_resultados
   where edicion between '2011-F' and '2017-F' and edicion like '%-F' and codigo ~ '-E'
     and tnr in (select tnr from pag)),
filas as (
  select p.tnr, u.o, substring(u.x from '<tr[^>]*class="([^"]*)"') clase,
         array(select btrim(replace(replace(regexp_replace(c, '<[^>]+>', '', 'g'), '&nbsp;', ' '), '&frac12;', '½'), E' \r\n\t')
                 from unnest(regexp_split_to_array(u.x, '</t[hd]>')) c) celdas
    from pag p, unnest(string_to_array(split_part(p.html, 'Información de jugadores', 1), '</tr>')) with ordinality u(x, o)
   where u.x like '%<t%'),
ubic as (
  select f.*, max(case when clase like 'CRng1b%' then f.o end) over w cab_o, max(case when clase like 'CRg1b%' then f.o end) over w grupo_o
    from filas f
  window w as (partition by f.tnr order by f.o)),
arrastre as (
  select u.*, first_value(u.celdas) over (partition by u.tnr, u.cab_o order by u.o) cab,
         first_value(u.celdas[1]) over (partition by u.tnr, u.grupo_o order by u.o) grupo
    from ubic u),
jug as (
  select t.edicion, t.codigo, a.tnr,
         nullif(a.celdas[array_position(a.cab, 'M.')], '')::smallint tablero,
         btrim(a.celdas[array_position(a.cab, 'Nombre')]) nombre,
         btrim(substring(a.grupo from '^\d+\.\s*([^(]*(?:\( ?[A-Z]{3} ?\))?)')) equipo,
         replace(replace(nullif(a.celdas[array_position(a.cab, 'Pts.')], ''), '½', '.5'), ',', '.') pts_txt,
         nullif(a.celdas[array_position(a.cab, 'Partidas')], '')::int partidas,
         coalesce(nullif(a.celdas[array_position(a.cab, 'Elo medio')], '')::int, 0) elo_rivales,
         (select count(*) from unnest(a.cab) h where h ~ '^\d+$') rondas
    from arrastre a join torneo t using (tnr)
   where a.clase ~ '^CRng[12]( |$)' and a.o > a.cab_o and a.grupo ~ '^\d+\.' and 'Partidas' = any(a.cab)),
jug2 as (
  select j.*, (case when pts_txt ~ '^\.' then '0' || pts_txt else pts_txt end)::numeric puntos from jug j),
entra as (
  select j.*, j.puntos / j.partidas p from jug2 j
   where j.tablero is not null and j.partidas > 0
     and j.partidas >= ceil(case when j.tablero = 5 then 0.42 else 0.57 end * j.rondas - 1e-9)),
perf as (
  select j.*, j.elo_rivales + case when p >= 1 then 800 when p <= 0 then -800
                                   else greatest(-800, least(800, round(-400 * log(1 / p - 1)))) end rendimiento
    from entra j),
puestos as (
  select f.*, row_number() over w orden, rank() over w rk
    from perf f
  window w as (partition by tnr, tablero order by p desc, puntos desc, rendimiento desc)),
orden as (select u.*, lag(rk) over (partition by tnr, tablero order by orden) rk_antes from puestos u)
insert into public.jdn_tableros (edicion, codigo, tnr, tablero, orden, puesto, nombre, equipo, porcentaje, puntos, calculado)
select edicion, codigo, tnr, tablero, orden, case when rk = rk_antes then null else rk end,
       nombre, equipo, round(100 * p, 1), puntos, true
  from orden;
