-- Llena public.jdn_resultados con los torneos JDN de chess-results.
--
-- chess-results no tiene API y desde una sesión de Claude Code no hay salida
-- al sitio: las páginas se piden desde la base con pg_net (como las pizarras
-- y Ajedrez estudiantil). Son dos pasos, porque pg_net contesta después:
--
-- 1) Pedir las páginas. Por cada torneo de torneos.txt, la clasificación
--    (art=1); y de los torneos por equipos, también la tabla final de
--    equipos (art=46). Devuelve "tnr:pedido" de cada página:
--
--      select string_agg(tnr||':'||art||':'||net.http_get(
--               'https://s3.chess-results.com/tnr'||tnr||'.aspx?lan=2&art='||art||'&turdet=YES&zeilen=99999',
--               timeout_milliseconds := 60000), ',')
--        from (values (343966, 1), ...) t(tnr, art);
--
--    Pedirle al mismo servidor (s3): chess-results redirige de un servidor a
--    otro y net._http_response guarda solo el último salto.
--
-- 2) Esperar a que net.http_request_queue quede vacía y correr este archivo
--    con la lista (tnr, pedido de art=1, pedido de art=46 o null) en src.
--    Reemplaza la tabla entera.
--
-- Las reglas (ver «Resultados JDN por comité» en
-- docs/decisiones/juegos-y-torneos.md):
--   · la edición sale del número de torneo (cada edición se subió en un
--     bloque propio);
--   · el código, del título: ritmo en las finales (Blitz, Rapid; lo demás es
--     Clásico) y zona en las eliminatorias; Equipo(s) y Fem(enino);
--   · las columnas se leen por el nombre del encabezado; los puntos son
--     «Pts.» o, si no está, «Des 1» (en todas esas tablas, Desempate 1 son
--     los puntos);
--   · de los equipos se lee la tabla final (art=46) y, si chess-results no
--     la trae, el orden de equipos de la página de resultados, sin récord.
-- Comprobado: da exactamente las filas de la revisión a mano, torneo por
-- torneo (cantidad, suma de puntos y nombre + comité).

with src(tnr, a1, a46) as (values (343966,9989,null),(343967,9990,null),(343968,9991,null),(343969,9992,null),(343970,9993,null),(343971,9994,null),(343972,9995,null),(343973,9996,null),(453409,9997,10167),(453411,9998,10169),(453412,9999,10168),(453413,10000,null),(453414,10001,null),(453415,10002,null),(453418,10003,null),(453419,10004,null),(453420,10005,null),(453422,10006,10179),(453423,10007,10176),(453425,10008,10180),(453493,10009,10181),(453494,10010,10178),(453495,10011,10187),(453496,10012,10184),(453497,10013,10182),(453499,10014,10177),(453500,10015,null),(453501,10016,null),(453502,10017,null),(453503,10018,null),(453504,10019,null),(453505,10020,null),(581446,10021,null),(581447,10022,null),(581448,10023,null),(581449,10024,null),(581450,10025,null),(581451,10026,null),(581452,10027,null),(581453,10028,null),(581454,10029,null),(581455,10030,null),(581456,10031,null),(581457,10032,null),(581495,10033,10183),(581496,10034,10211),(581497,10035,10188),(581498,10036,10185),(581500,10037,10186),(581501,10038,10216),(581502,10039,10210),(581503,10040,10202),(677490,10041,null),(677491,10042,null),(677492,10043,null),(677493,10044,10189),(677494,10045,10196),(677495,10046,10195),(677496,10047,10192),(677497,10048,null),(677498,10049,null),(677499,10050,10191),(677500,10051,10190),(677501,10052,10193),(677502,10053,10203),(677503,10054,null),(677504,10055,null),(677516,10056,null),(677517,10057,10204),(677518,10058,10194),(677519,10059,null),(677520,10060,null),(714997,10061,null),(714998,10062,null),(715001,10063,null),(715003,10064,null),(715004,10065,null),(715006,10066,null),(715007,10067,10217),(715008,10068,10220),(715012,10069,10212),(715013,10070,10228),(715014,10071,10214),(715016,10072,10201),(715017,10073,null),(715019,10074,null),(715020,10075,null),(715021,10076,null),(715023,10077,null),(715024,10078,null),(715025,10079,10208),(715026,10080,10199),(715365,10081,10225),(715366,10082,10200),(715367,10083,10198),(715369,10084,10197),(715370,10085,null),(715371,10086,null),(715372,10087,null),(715374,10088,null),(715375,10089,null),(715376,10090,null),(715377,10091,10170),(715378,10092,10175),(715379,10093,10174),(715380,10094,10173),(715382,10095,10171),(715383,10096,10172),(941243,10097,null),(941251,10098,null),(941260,10099,null),(941274,10100,null),(941461,10101,10238),(941465,10102,10215),(941513,10103,10233),(943738,10104,10237),(943739,10105,null),(943747,10106,null),(943753,10107,null),(943755,10108,null),(943762,10109,10206),(943767,10110,10205),(943771,10111,null),(943776,10112,null),(967761,10113,null),(967762,10114,null),(967763,10115,null),(967764,10116,10226),(967765,10117,10235),(967766,10118,10224),(967768,10119,null),(967769,10120,null),(967770,10121,null),(967771,10122,10234),(967772,10123,10213),(967773,10124,10229),(967776,10125,null),(967778,10126,null),(967779,10127,null),(967780,10128,10221),(967781,10129,10230),(967783,10130,10207),(967910,10131,10223),(967911,10132,null),(967912,10133,10222),(967913,10134,null),(967914,10135,10232),(967915,10136,null),(967916,10137,10209),(967917,10138,null),(967918,10139,10231),(967919,10140,null),(967920,10141,10218),(967921,10142,null),(967922,10143,10219),(967923,10144,null),(967924,10145,10236),(967925,10146,null),(967926,10147,10227),(967928,10148,null),(1328730,1032,1068),(1328731,1033,null),(1328733,1034,1069),(1328734,1035,null),(1328735,1036,1070),(1328736,1037,null),(1328737,1038,1071),(1328738,1039,null),(1328740,1040,1072),(1328741,1041,null),(1328742,1042,1073),(1328743,1043,null),(1328760,1044,1074),(1328761,1045,null),(1328763,1046,1075),(1328766,1047,null),(1328770,1048,1076),(1328772,1049,null),(1328773,1050,1077),(1328775,1051,null),(1329122,1052,1078),(1329127,1053,null),(1329131,1054,1079),(1329136,1055,null),(1329144,1056,1080),(1329145,1057,null),(1329147,1058,1081),(1329148,1059,null),(1329149,1060,1082),(1329150,1061,null),(1329151,1062,1083),(1329153,1063,null),(1329154,1064,1084),(1329155,1065,null),(1329156,1066,1085),(1329158,1067,null),(1242515,1121,1386),(1242517,1123,null),(1242518,1124,1387),(1242519,1125,1388),(1242520,1126,1389),(1242521,1127,1390),(1242522,1128,null),(1242523,1129,null),(1242527,1133,null),(1242529,1135,1391),(1242530,1136,null),(1242531,1137,1392),(1242532,1138,null),(1242533,1139,null),(1242713,1319,1393),(1242714,1320,1394),(1242715,1321,1395),(1242718,1324,null),(1242721,1327,null),(1242725,1331,null)),
pag as (
  select s.tnr, s.a1, s.a46, btrim(substring(r.content from '<h2>([^<]*)</h2>')) titulo, r.content c1, r46.content c46
    from src s join net._http_response r on r.id = s.a1 left join net._http_response r46 on r46.id = s.a46),
tor as (
  select p.*,
    case when tnr < 400000 then '2018-E' when tnr < 500000 then '2019-F' when tnr < 600000 then '2021-E'
         when tnr < 700000 then '2022-E' when tnr < 800000 then '2023-F' when tnr < 950000 then '2024-E'
         when tnr < 1000000 then '2024-F' when tnr < 1300000 then '2025-E' else '2026-F' end edicion
    from pag p),
tor2 as (
  select t.*,
    case when edicion like '%-F'
         then case when titulo ~* 'blitz' then 'B' when titulo ~* 'rapid' then 'R' else 'C' end
         else case when titulo ~* 'zona 1|z1' then 'Z1' when titulo ~* 'zona 2|z2' then 'Z2' else '' end end
    || '-U' || substring(titulo from 'U(12|16|20)')
    || case when titulo ~* 'equipo' then '-E' else '-I' end
    || case when titulo ~* 'fem' then 'F' else 'A' end codigo,
    titulo ~* 'equipo' es_equipo
    from tor t),
-- Una tabla de chess-results en filas de celdas.
tabla as (
  select t.edicion, t.codigo, t.tnr, t.es_equipo, 'ind' fuente,
         split_part(substr(t.c1, strpos(t.c1, 'class="CRs1"')), '</table>', 1) html
    from tor2 t where not t.es_equipo
  union all
  select t.edicion, t.codigo, t.tnr, t.es_equipo, 'eq',
         split_part(substr(t.c46, strpos(t.c46, 'class="CRs1"')), '</table>', 1)
    from tor2 t where t.es_equipo and t.c46 like '%class="CRs1"%'),
filas as (
  select tb.edicion, tb.codigo, tb.tnr, tb.fuente, u.o,
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
         case when f.fuente = 'ind' then coalesce(f.celdas[array_position(c.cols, 'Club/Ciudad')], '') else '' end comite,
         case when f.fuente = 'eq' then f.celdas[array_position(c.cols, '+')] || '-' || f.celdas[array_position(c.cols, '=')] || '-' || f.celdas[array_position(c.cols, '-')] end record,
         coalesce(f.celdas[array_position(c.cols, 'Pts.')], f.celdas[array_position(c.cols, 'Des 1')]) puntos
    from filas f join cabeza c using (tnr, fuente) where not f.es_cabeza),
-- Equipos sin tabla final: el orden de la página de resultados
-- ("1. Equipo (Elo medio:…, Des 1: 22 / …").
sin_tabla as (
  select t.edicion, t.codigo, t.tnr, m.n::int orden, m.n puesto, btrim(m.nombre) nombre, '' comite, null::text record, m.pts puntos
    from tor2 t,
         lateral (select x[1] n, x[2] nombre, x[3] pts
                    from regexp_matches(regexp_replace(regexp_replace(regexp_replace(t.c1, '<[^>]+>', ' ', 'g'), '&nbsp;', ' ', 'g'), '\s+', ' ', 'g'),
                                        ' (\d+)\. ([^(]+) \(Elo medio:\d+, (?:Capitán: [^/]*/ )?Des 1: ([0-9,]+)', 'g') x) m
   where t.es_equipo and coalesce(t.c46, '') not like '%class="CRs1"%'),
todo as (select * from de_tablas union all select * from sin_tabla),
borrar as (delete from public.jdn_resultados returning 1)
insert into public.jdn_resultados (edicion, codigo, tnr, orden, puesto, nombre, comite, record, puntos)
select edicion, codigo, tnr, orden, puesto::smallint, btrim(nombre), btrim(comite), record, replace(puntos, ',', '.')::numeric
  from todo
 where (select count(*) from borrar) >= 0;
