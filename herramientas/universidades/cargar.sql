-- Llena public.uni_resultados con los torneos universitarios de
-- chess-results (torneos.txt). Igual que herramientas/jdn-comites/cargar.sql,
-- en dos pasos, porque pg_net contesta después:
--
-- 1) Pedir las páginas al mismo servidor (s3): la clasificación (art=1) de
--    cada torneo y, de los de equipos, la tabla final (art=46):
--
--      select string_agg(tnr||':'||net.http_get(
--               'https://s3.chess-results.com/tnr'||tnr||'.aspx?lan=2&art='||art||'&turdet=YES&zeilen=99999',
--               timeout_milliseconds := 60000), ',')
--        from (values (33464, 1), ...) t(tnr, art);
--
-- 2) Esperar a que net.http_request_queue quede vacía y correr este archivo
--    con la lista (tnr, edición, código, pedido de art=1, pedido de art=46 o
--    null, desempate de los puntos sin tabla final: 1, o 2 si torneos.txt
--    dice «D2») en src. Reemplaza la tabla entera.
--
-- La universidad de un jugador es la columna «Gr» (el grupo: así la anotó
-- el FECUNDE 2020 en línea, que en «Club/Ciudad» puso el usuario de
-- chess.com) o «Club/Ciudad»; si no está, la
-- de la federación cuando no es un país (los JUNCOS viejos escribían ahí
-- «UCR», «UNA», «CUC»). En un torneo por equipos, el equipo. Los JUDUCA
-- individuales traen solo el país: la página deduce la universidad del mismo
-- jugador en los equipos de esa edición.
--
-- Los jugadores y las partidas (uni_jugadores, uni_partidas) se cargan
-- DESPUÉS, con los mismos archivos de los JDN, cambiando jdn_ por uni_
-- (una sola copia de cada regla): herramientas/jdn-comites/
-- cargar-jugadores-equipos.sql, cargar-jugadores-individual.sql y
-- cargar-partidas.sql, con sus pedidos (art=20 de los torneos por equipos,
-- art=4 y art=1 de los individuales). Al cargarlos el 15/10/2026: 2114
-- jugadores y 5511 partidas, y con el Grand Prix 2016, 2276 y 5811; 19 partidas de equipos (de 5530) quedaron sin
-- ubicar porque chess-results escribe distinto el nombre del rival.
--
-- Ver «Resultados universitarios por universidad» en
-- docs/decisiones/juegos-y-torneos.md.

with src(tnr, edicion, codigo, a1, a46, des) as (values (33464,'2010-JUDUCA','C-U-EA',18538,18569,1),(33466,'2010-JUDUCA','C-U-IA',18539,null,1),(48229,'2011-JUNCOS','C-U-IA',18461,null,1),(48230,'2011-JUNCOS','C-U-IF',18462,null,1),(48235,'2011-JUNCOS','C-U-EF',18460,18570,1),(48236,'2011-JUNCOS','C-U-EA',18463,18571,1),(57340,'2011-INTER','C-U-IA',18465,null,1),(57334,'2011-INTER','C-U-EF',18466,18572,1),(57341,'2011-INTER','C-U-EA',18468,18573,1),(98173,'2013-JUNCOS','C-U-IA',18470,null,1),(98174,'2013-JUNCOS','C-U-IF',18471,null,1),(98172,'2013-JUNCOS','C-U-EF',18469,18574,1),(98176,'2013-JUNCOS','C-U-EA',18472,18575,1),(128651,'2014-FECUNDE','R-U-IA',18473,null,1),(128652,'2014-FECUNDE','R-U-IF',18474,null,1),(130337,'2014-JUDUCA','C-U-IA',18542,null,1),(130338,'2014-JUDUCA','C-U-IF',18543,null,1),(130251,'2014-JUDUCA','C-U-EF',18541,18576,1),(130249,'2014-JUDUCA','C-U-EA',18540,18577,1),(145185,'2014-LIGA','R-U-EA',18475,18578,1),(186717,'2015-JUNCOS','C-U-IA',18477,null,1),(186718,'2015-JUNCOS','C-U-IF',18478,null,1),(186719,'2015-JUNCOS','C-U-EF',18479,18579,1),(186720,'2015-JUNCOS','C-U-EA',18476,18580,1),(217791,'2016-JUDUCA','C-U-IA',18544,null,1),(217793,'2016-JUDUCA','C-U-IF',18545,null,1),(217795,'2016-JUDUCA','C-U-EF',18546,18581,1),(217805,'2016-JUDUCA','C-U-EA',18547,18582,1),(270596,'2017-JUNCOS','C-U-IA',18480,null,1),(270597,'2017-JUNCOS','C-U-IF',18481,null,1),(270587,'2017-JUNCOS','C-U-EF',18482,18583,1),(270639,'2017-JUNCOS','C-U-EA',18483,18584,1),(347063,'2018-JUDUCA','C-U-IA',18550,null,1),(347062,'2018-JUDUCA','C-U-IF',18549,null,1),(347061,'2018-JUDUCA','C-U-EF',18548,18585,1),(347128,'2018-JUDUCA','C-U-EA',18551,18586,2),(348082,'2018-JUDUCA','B-U-IA',18552,null,1),(389684,'2018-CONARE','R-U-IA',18484,null,1),(390150,'2018-CONARE','R-UB-IA',18485,null,1),(390151,'2018-CONARE','R-U-IF',18486,null,1),(389203,'2018-CONARE','R-U-EF',18489,18587,1),(389121,'2018-CONARE','R-U-EA',18490,18588,1),(392240,'2018-CONARE','B-U-IA',18487,null,1),(391858,'2018-CONARE','B-UB-IA',18488,null,1),(391840,'2018-CONARE','B-U-IF',18493,null,1),(392239,'2018-CONARE','B-U-EF',18491,18589,1),(391836,'2018-CONARE','B-U-EA',18492,18590,1),(425471,'2019-JUNCOS','C-U-IA',18495,null,1),(425482,'2019-JUNCOS','C-U-IF',18497,null,1),(425485,'2019-JUNCOS','C-U-EF',18496,18591,1),(425494,'2019-JUNCOS','C-U-EA',18494,18592,1),(464943,'2019-BLITZ','B-U-IA',18498,null,1),(464945,'2019-BLITZ','B-U-IF',18499,null,1),(538795,'2020-FECUNDE','R-U-IA',18501,null,1),(538799,'2020-FECUNDE','R-U-IF',18500,null,1),(533502,'2020-CENTRO','R-U-EA',18567,18593,1),(533592,'2020-CENTRO','R-U-EF',18568,18594,1),(641905,'2022-CONARE','R-U-IA',18502,null,1),(641906,'2022-CONARE','R-U-IF',18503,null,1),(668399,'2022-FEDEU','R-U-IA',18505,null,1),(668398,'2022-FEDEU','R-U-IF',18504,null,1),(754767,'2023-JUNCOS','R-U-IA',18510,null,1),(754770,'2023-JUNCOS','R-U-IF',18511,null,1),(754781,'2023-JUNCOS','R-U-EF',18508,18595,1),(754774,'2023-JUNCOS','R-U-EA',18509,18596,1),(765944,'2023-JUNCOS','B-U-IA',18506,null,1),(765947,'2023-JUNCOS','B-U-IF',18507,null,1),(792231,'2023-JUDUCA','C-U-IA',18553,null,1),(792260,'2023-JUDUCA','C-U-IF',18554,null,1),(792265,'2023-JUDUCA','C-U-EF',18556,18597,1),(792263,'2023-JUDUCA','C-U-EA',18555,18598,2),(793108,'2023-JUDUCA','B-U-EF',18557,18599,1),(793116,'2023-JUDUCA','B-U-EA',18558,18600,1),(823071,'2023-FEDEU','R-U-IA',18514,null,1),(823093,'2023-FEDEU','R-U-IF',18512,null,1),(823076,'2023-FEDEU','R-FUN-IA',18513,null,1),(828403,'2023-CONARE','R-U-IA',18516,null,1),(828414,'2023-CONARE','R-U-IF',18515,null,1),(936516,'2024-FEDEU','R-U-IA',18518,null,1),(936519,'2024-FEDEU','R-U-IF',18517,null,1),(1031802,'2024-CONARE','R-U-IA',18519,null,1),(1031803,'2024-CONARE','R-U-IF',18520,null,1),(1177551,'2025-FEDEU','R-U-IA',18521,null,1),(1177552,'2025-FEDEU','R-U-IF',18522,null,1),(1217667,'2025-JUDUCA','C-U-IA',18561,null,1),(1217674,'2025-JUDUCA','C-U-IF',18562,null,1),(1217612,'2025-JUDUCA','C-U-EF',18560,18601,1),(1217521,'2025-JUDUCA','C-U-EA',18559,18602,2),(1227393,'2025-JUDUCA','B-U-IA',18563,null,1),(1227394,'2025-JUDUCA','B-U-IF',18564,null,1),(1227396,'2025-JUDUCA','B-U-EF',18565,18603,1),(1227399,'2025-JUDUCA','B-U-EA',18566,18604,2),(1257509,'2025-CONARE','R-U-IA',18524,null,1),(1257510,'2025-CONARE','R-U-IF',18523,null,1),(1422261,'2026-FEDEU','R-U-IA',18526,null,1),(1422262,'2026-FEDEU','R-U-IF',18525,null,1),(1473962,'2026-CONARE','R-U-IA',18528,null,1),(1473963,'2026-CONARE','R-U-IF',18527,null,1),(1498218,'2026-CONARE2','R-U-IA',18530,null,1),(1498221,'2026-CONARE2','R-U-IF',18529,null,1),(236107,'2016-GP1','R-U-IA',18944,null,1),(236049,'2016-GP1','R-U-IF',18942,null,1),(236110,'2016-GP1','R-UB-IA',18945,null,1),(240007,'2016-GP2','R-U-EA',18951,18976,1),(240003,'2016-GP2','R-U-EF',18950,18975,1),(239997,'2016-GP2','R-U-IA',18948,null,1),(239993,'2016-GP2','R-U-IF',18946,null,1),(240000,'2016-GP2','R-UB-IA',18949,null,1),(239995,'2016-GP2','R-UB-IF',18947,null,1),(245651,'2016-GP3','R-U-EA',18952,18978,1),(245652,'2016-GP3','R-U-EF',18953,18977,1),(245654,'2016-GP3','R-U-IA',18955,null,1),(245683,'2016-GP3','R-U-IF',18957,null,1),(245655,'2016-GP3','R-UB-IA',18956,null,1),(245653,'2016-GP3','R-UB-IF',18954,null,1)),
tor as (
  select s.tnr, s.edicion, s.codigo, s.des, s.codigo ~ '-E[AF]$' es_equipo, r.content c1, r46.content c46
    from src s join net._http_response r on r.id = s.a1 left join net._http_response r46 on r46.id = s.a46),
tabla as (
  select t.edicion, t.codigo, t.tnr, 'ind' fuente, '1' des,
         split_part(substr(t.c1, strpos(t.c1, 'class="CRs1"')), '</table>', 1) html
    from tor t where not t.es_equipo
  union all
  select t.edicion, t.codigo, t.tnr, 'eq',
         coalesce(substring(t.c46 from 'Desempate (\d): points \(game-points\)'), '1'),
         split_part(substr(t.c46, strpos(t.c46, 'class="CRs1"')), '</table>', 1)
    from tor t where t.es_equipo and t.c46 like '%class="CRs1"%'),
filas as (
  select tb.edicion, tb.codigo, tb.tnr, tb.fuente, tb.des, u.o,
         u.p like '%<th%' es_cabeza,
         array(select btrim(regexp_replace(regexp_replace(x, '<[^>]+>', '', 'g'), '&nbsp;', '', 'g'), E' \r\n\t')
                 from unnest(regexp_split_to_array(u.p, '</t[hd]>')) x) celdas
    from tabla tb, unnest(string_to_array(substr(tb.html, strpos(tb.html, '<tr')), '</tr>')) with ordinality u(p, o)
   where u.p like '%<t%'),
cabeza as (select tnr, fuente, celdas cols from filas where es_cabeza and o = 1),
de_tablas as (
  select f.edicion, f.codigo, f.tnr, row_number() over (partition by f.tnr order by f.o) orden,
         nullif(f.celdas[array_position(c.cols, 'Rk.')], '') puesto,
         case when f.fuente = 'ind' then f.celdas[array_position(c.cols, 'Nombre')] else f.celdas[array_position(c.cols, 'Equipo')] end nombre,
         case when f.fuente <> 'ind' then ''
              when coalesce(f.celdas[array_position(c.cols, 'Gr')], '') <> '' then f.celdas[array_position(c.cols, 'Gr')]
              when coalesce(f.celdas[array_position(c.cols, 'Club/Ciudad')], '') <> '' then f.celdas[array_position(c.cols, 'Club/Ciudad')]
              when coalesce(f.celdas[array_position(c.cols, 'FED')], '') !~ '^(CRC|NCA|PAN|GUA|HON|ESA|BIZ|MEX|CUB|COL|VEN|USA|DOM|PUR|ESP|ARG|PER|BRA|CHI|ECU|BOL|URU|PAR|CAN|FID)?$'
                then f.celdas[array_position(c.cols, 'FED')]
              else '' end comite,
         case when f.fuente = 'eq' then f.celdas[array_position(c.cols, '+')] || '-' || f.celdas[array_position(c.cols, '=')] || '-' || f.celdas[array_position(c.cols, '-')] end record,
         coalesce(f.celdas[array_position(c.cols, 'Pts.')], f.celdas[array_position(c.cols, 'Des ' || f.des)]) puntos
    from filas f join cabeza c using (tnr, fuente) where not f.es_cabeza),
-- El orden de equipos de la página de resultados ("1. Equipo (Elo
-- medio:…, Des 1: 22 / …"): el puesto de los equipos sin tabla final, y los
-- puntos de los que la traen sin desempates (JUNCOS 2023).
de_art1 as (
  select t.edicion, t.codigo, t.tnr, m.n::int orden, m.n puesto, btrim(m.nombre) nombre, m.pts puntos, coalesce(t.c46, '') like '%class="CRs1"%' con_tabla
    from tor t,
         lateral (select x[1] n, x[2] nombre, case when t.des = 2 then x[4] else x[3] end pts
                    from regexp_matches(regexp_replace(regexp_replace(regexp_replace(t.c1, '<[^>]+>', ' ', 'g'), '&nbsp;', ' ', 'g'), '\s+', ' ', 'g'),
                                        ' (\d+)\. ([^(]+(?:\( ?[A-Z]{3} ?\))?) ?\(Elo medio:\d+, (?:Capitán: [^/]*/ )?Des 1: ([0-9,]+)(?: / Des 2: ([0-9,]+))?', 'g') x) m
   where t.es_equipo),
todo as (
  select d.edicion, d.codigo, d.tnr, d.orden, d.puesto, d.nombre, d.comite, d.record, coalesce(d.puntos, a.puntos) puntos
    from de_tablas d left join de_art1 a on a.tnr = d.tnr and a.nombre = btrim(d.nombre)
  union all
  select edicion, codigo, tnr, orden, puesto, nombre, '', null, puntos from de_art1 where not con_tabla),
borrar as (delete from public.uni_resultados returning 1)
insert into public.uni_resultados (edicion, codigo, tnr, orden, puesto, nombre, comite, record, puntos)
select edicion, codigo, tnr, orden, puesto::smallint, btrim(nombre), btrim(comite), record, replace(puntos, ',', '.')::numeric
  from todo
 where (select count(*) from borrar) >= 0;
