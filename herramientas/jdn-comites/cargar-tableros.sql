-- Llena public.jdn_tableros con la «Clasificación por tableros» (art=81) de
-- los torneos por equipos de las finales JDN. Ver «Los mejores tableros de las
-- finales» en docs/decisiones/juegos-y-torneos.md.
--
-- Como cargar.sql, son dos pasos, porque pg_net contesta después:
--
-- 1) Pedir las páginas. Los torneos son los de equipos de las finales
--    (todos los de jdn_resultados con edición AAAA-F y código …-E…):
--
--      select string_agg(tnr||':'||net.http_get(
--               'https://s3.chess-results.com/tnr'||tnr||'.aspx?lan=2&art=81&turdet=YES&flag=30',
--               timeout_milliseconds := 60000), ',' order by tnr)
--        from (select distinct tnr from public.jdn_resultados
--               where edicion like '%-F' and codigo ~ '-E') t;
--
-- 2) Esperar a que net.http_request_queue quede vacía y correr este archivo
--    con la lista (tnr, pedido) en src. Reemplaza la tabla entera. La edición
--    y el código salen de jdn_resultados (el mismo torneo).
--
-- Las reglas:
--   · la página trae una tabla con un bloque por tablero («Board N»; en las
--     finales 2018-2021 el 5 es la reserva) y el encabezado de columnas en
--     cada bloque; las columnas se leen por el nombre del encabezado;
--   · el porcentaje y los puntos son los desempates que la leyenda llama
--     «Percent» y «points (game-points)» (cambian de número según el torneo);
--   · se guarda el orden de chess-results, que ya aplica los desempates y el
--     mínimo de partidas que eligió el árbitro; un puesto vacío es un empate.
-- Comprobado al cargar: 86 torneos, todos con su tablero 1 y con porcentaje
-- en cada fila.

with src(tnr, pedido) as (values (364297,11460),(364299,11461),(364301,11462),(364305,11463),(364447,11464),(364766,11465),(364767,11466),(364768,11467),(453409,11468),(453411,11469),(453412,11470),(453422,11471),(453423,11472),(453425,11473),(453493,11474),(453494,11475),(453495,11476),(453496,11477),(453497,11478),(453499,11479),(588215,11480),(588216,11481),(588217,11482),(588219,11483),(588220,11484),(588227,11485),(588228,11486),(588229,11487),(588230,11488),(588231,11489),(588232,11490),(591413,11491),(715007,11492),(715008,11493),(715012,11494),(715013,11495),(715014,11496),(715016,11497),(715025,11498),(715026,11499),(715365,11500),(715366,11501),(715367,11502),(715369,11503),(715377,11504),(715378,11505),(715379,11506),(715380,11507),(715382,11508),(715383,11509),(967764,11510),(967765,11511),(967766,11512),(967771,11513),(967772,11514),(967773,11515),(967780,11516),(967781,11517),(967783,11518),(967910,11519),(967912,11520),(967914,11521),(967916,11522),(967918,11523),(967920,11524),(967922,11525),(967924,11526),(967926,11527),(1328730,11528),(1328733,11529),(1328735,11530),(1328737,11531),(1328740,11532),(1328742,11533),(1328760,11534),(1328763,11535),(1328770,11536),(1328773,11537),(1329122,11538),(1329131,11539),(1329144,11540),(1329147,11541),(1329149,11542),(1329151,11543),(1329154,11544),(1329156,11545)),
pag as (
  select s.tnr,
         case when strpos(r.content, 'por tableros') > 0
              then split_part(substr(r.content, strpos(r.content, 'por tableros')), '</table>', 1) end html
    from src s join net._http_response r on r.id = s.pedido),
leyenda as (
  select tnr,
         substring(html from 'Desempate (\d): Percent') des_pct,
         substring(html from 'Desempate (\d): points \(game-points\)') des_pts
    from pag),
filas as (
  select p.tnr, u.o, u.p,
         u.p like '%colspan%' es_tablero,
         u.p like '%Rk.%' es_cabeza,
         array(select btrim(regexp_replace(regexp_replace(x, '<[^>]+>', '', 'g'), '&nbsp;', '', 'g'), E' \r\n\t')
                 from unnest(regexp_split_to_array(u.p, '</t[hd]>')) x) celdas
    from pag p, unnest(string_to_array(substr(p.html, strpos(p.html, '<tr')), '</tr>')) with ordinality u(p, o)
   where u.p like '%<t%'),
marcadas as (
  select f.*, max(case when es_tablero then substring(f.p from 'Board (\d+)')::int end) over (partition by tnr order by o) tablero
    from filas f),
cabeza as (select distinct on (tnr) tnr, celdas cols from marcadas where es_cabeza order by tnr, o),
torneo as (select distinct tnr, edicion, codigo from public.jdn_resultados where edicion like '%-F' and codigo ~ '-E'),
tableros as (
  select t.edicion, t.codigo, m.tnr, m.tablero,
         row_number() over (partition by m.tnr, m.tablero order by m.o) orden,
         nullif(m.celdas[array_position(c.cols, 'Rk.')], '') puesto,
         m.celdas[array_position(c.cols, 'Nombre')] nombre,
         m.celdas[array_position(c.cols, 'Equipo')] equipo,
         m.celdas[array_position(c.cols, 'Des ' || l.des_pct)] porcentaje,
         m.celdas[array_position(c.cols, 'Des ' || l.des_pts)] puntos
    from marcadas m join cabeza c using (tnr) join leyenda l using (tnr) join torneo t using (tnr)
   where not m.es_tablero and not m.es_cabeza and m.tablero is not null),
borrar as (delete from public.jdn_tableros returning 1)
insert into public.jdn_tableros (edicion, codigo, tnr, tablero, orden, puesto, nombre, equipo, porcentaje, puntos)
select edicion, codigo, tnr, tablero, orden, puesto::smallint, btrim(nombre), btrim(equipo),
       replace(porcentaje, ',', '.')::numeric, nullif(replace(puntos, ',', '.'), '')::numeric
  from tableros
 where (select count(*) from borrar) >= 0;
