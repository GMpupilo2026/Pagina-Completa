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
--    Reemplaza las filas de los torneos de src (y solo esas): así se puede
--    cargar una edición sin volver a pedir las demás, que pg_net ya borró.
--
-- Las reglas (ver «Resultados JDN por comité» en
-- docs/decisiones/juegos-y-torneos.md):
--   · la edición sale del número de torneo (cada edición se subió en un
--     bloque propio);
--   · el código, del título: ritmo en las finales (Blitz, Rapid; lo demás es
--     Clásico) y zona en las eliminatorias; Equipo(s) y Fem(enino);
--   · 2011-2017 (ver «Las finales y eliminatorias de 2011 a 2017»): la
--     categoría se escribía «Infantil», «Sub 16» o «U 16» (U16) y «Juvenil»,
--     «Sub 20» o «U19» (U20, que en 2016 se llamó U19). Dos cosas que el
--     título no dice salen del número de torneo: el ritmo rápido de la final
--     2011 (52625-52628: las 7 rondas se cargaron el primer día; los
--     clásicos, 52641-52647, cuatro días después) y la zona del 218655
--     (U16 absoluto 2016, «Clasificatorio», con los comités de la Zona 1);
--   · las columnas se leen por el nombre del encabezado; los puntos son
--     «Pts.» o, si no está, el desempate que la leyenda de la tabla llama
--     «points (game-points)» (casi siempre Des 1, pero en la final 2021 es
--     Des 2: Des 1 ahí es el encuentro directo); si la leyenda no lo dice,
--     Des 1;
--   · de los equipos se lee la tabla final (art=46) y, si chess-results no
--     la trae, el orden de equipos de la página de resultados, sin récord.
--     Sin tabla final, art=46 devuelve el «Ranking inicial de los equipos»
--     (el orden por Elo, antes de jugar): esa página no cuenta como tabla.
-- Comprobado: da exactamente las filas de la revisión a mano, torneo por
-- torneo (cantidad, suma de puntos y nombre + comité).

with src(tnr, a1, a46) as (values (50961,33068,33205),(50962,33069,33206),(50964,33070,null),(50968,33071,null),(51031,33072,null),(52625,32976,null),(52626,32977,null),(52627,32978,null),(52628,32979,null),(52639,33024,33161),(52640,33025,33162),(52641,32980,null),(52642,32981,null),(52643,32982,null),(52644,33026,33163),(52645,33027,33164),(52647,32983,null),(85327,33080,null),(85328,33081,null),(85329,33082,null),(85335,33085,33207),(85336,33086,33208),(85338,33087,null),(85339,33088,null),(85343,33091,null),(87238,33028,33165),(87239,33029,33166),(87240,33030,33167),(87241,33031,33168),(87242,32984,null),(87243,32985,null),(87244,32986,null),(87245,32987,null),(87314,33032,33169),(87315,33033,33170),(87320,33034,33171),(87322,33035,33172),(87323,32988,null),(87324,32989,null),(87325,32990,null),(87328,32991,null),(114693,33092,null),(114694,33093,null),(114695,33094,null),(114696,33095,null),(114697,33096,null),(114698,33097,null),(114699,33098,null),(114700,33099,null),(114703,33102,33209),(127258,32992,null),(127259,32993,null),(127260,32994,null),(127261,32995,null),(127262,33036,33173),(127263,33037,33174),(127264,33038,33175),(127265,33039,33176),(127266,32996,null),(127267,32997,null),(127268,32998,null),(127269,32999,null),(127270,33040,33177),(127271,33041,33178),(127272,33042,33179),(127273,33043,33180),(169309,33105,33210),(170996,33106,33211),(170997,33107,33212),(170998,33108,33213),(170999,33109,null),(171000,33110,null),(171001,33111,null),(171002,33112,null),(171003,33113,33214),(171004,33114,33215),(171006,33115,null),(171008,33116,null),(180315,33044,33181),(180316,33045,33182),(180317,33046,33183),(180319,33047,33184),(180321,33000,null),(180322,33001,null),(180323,33002,null),(180324,33003,null),(180398,33048,33185),(180399,33049,33186),(180400,33050,33187),(180402,33051,33188),(180404,33004,null),(180405,33005,null),(180406,33006,null),(180407,33007,null),(218631,33117,null),(218633,33118,null),(218640,33119,null),(218652,33121,33216),(218655,33122,null),(218658,33123,null),(218669,33125,33217),(218701,33126,null),(218702,33127,null),(230041,33052,33189),(230042,33053,33190),(230043,33054,33191),(230044,33055,33192),(230135,33008,null),(230136,33009,null),(230137,33010,null),(230138,33011,null),(230192,33056,33193),(230194,33057,33194),(230196,33058,33195),(230198,33059,33196),(230199,33012,null),(230200,33013,null),(230201,33014,null),(230202,33015,null),(273399,33129,null),(273400,33130,null),(273401,33131,null),(273413,33132,null),(273414,33133,null),(273415,33134,null),(273416,33135,null),(273419,33136,33218),(273538,33137,33219),(273660,33128,33220),(274152,33138,33221),(274185,33139,33222),(274227,33140,33223),(274228,33141,33224),(289611,33060,33197),(289612,33061,33198),(289613,33062,33199),(289614,33063,33200),(289615,33016,null),(289616,33017,null),(289617,33018,null),(289618,33019,null),(289955,33064,33201),(289956,33065,33202),(289957,33066,33203),(289958,33067,33204),(289959,33020,null),(289960,33021,null),(289962,33022,null),(289963,33023,null)),
pag as (
  select s.tnr, s.a1, s.a46, btrim(substring(r.content from '<h2>([^<]*)</h2>')) titulo, r.content c1, r46.content c46
    from src s join net._http_response r on r.id = s.a1 left join net._http_response r46 on r46.id = s.a46),
tor as (
  select p.*,
    case when tnr < 51100 then '2011-E' when tnr < 60000 then '2011-F' when tnr < 86000 then '2012-E'
         when tnr < 100000 then '2012-F' when tnr < 120000 then '2013-E' when tnr < 150000 then '2013-F'
         when tnr < 175000 then '2015-E' when tnr < 200000 then '2015-F' when tnr < 225000 then '2016-E'
         when tnr < 250000 then '2016-F' when tnr < 280000 then '2017-E' when tnr < 300000 then '2017-F'
         when tnr < 350000 then '2018-E' when tnr < 400000 then '2018-F' when tnr < 440000 then '2019-E'
         when tnr < 500000 then '2019-F' when tnr < 585000 then '2021-E' when tnr < 600000 then '2021-F'
         when tnr < 700000 then '2022-E' when tnr < 800000 then '2023-F' when tnr < 950000 then '2024-E'
         when tnr < 1000000 then '2024-F' when tnr < 1300000 then '2025-E' else '2026-F' end edicion
    from pag p),
tor2 as (
  select t.*,
    case when edicion like '%-F'
         then case when titulo ~* 'blitz' then 'B' when titulo ~* 'rapid' or tnr between 52625 and 52628 then 'R' else 'C' end
         else case when titulo ~* 'zona ?0?1|z1' or tnr = 218655 then 'Z1' when titulo ~* 'zona ?0?2|z2' then 'Z2' else '' end end
    || '-U' || coalesce(substring(titulo from 'U(12|16|20)'),
                        case when titulo ~* 'infantil|(u|sub) ?16' then '16' when titulo ~* 'juvenil|(u|sub) ?(19|20)' then '20' end)
    || case when titulo ~* 'equipo' then '-E' else '-I' end
    || case when titulo ~* 'fem' then 'F' else 'A' end codigo,
    titulo ~* 'equipo' es_equipo
    from tor t),
-- Una tabla de chess-results en filas de celdas.
tabla as (
  select t.edicion, t.codigo, t.tnr, t.es_equipo, 'ind' fuente, '1' des,
         split_part(substr(t.c1, strpos(t.c1, 'class="CRs1"')), '</table>', 1) html
    from tor2 t where not t.es_equipo
  union all
  select t.edicion, t.codigo, t.tnr, t.es_equipo, 'eq',
         coalesce(substring(t.c46 from 'Desempate (\d): points \(game-points\)'), '1'),
         split_part(substr(t.c46, strpos(t.c46, 'class="CRs1"')), '</table>', 1)
    from tor2 t where t.es_equipo and t.c46 like '%class="CRs1"%' and t.c46 not like '%Ranking inicial de los equipos%'),
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
         case when f.fuente = 'ind' then coalesce(f.celdas[array_position(c.cols, 'Club/Ciudad')], '') else '' end comite,
         case when f.fuente = 'eq' then f.celdas[array_position(c.cols, '+')] || '-' || f.celdas[array_position(c.cols, '=')] || '-' || f.celdas[array_position(c.cols, '-')] end record,
         coalesce(f.celdas[array_position(c.cols, 'Pts.')], f.celdas[array_position(c.cols, 'Des ' || f.des)]) puntos
    from filas f join cabeza c using (tnr, fuente) where not f.es_cabeza),
-- Equipos sin tabla final: el orden de la página de resultados
-- ("1. Equipo (Elo medio:…, Des 1: 22 / …").
sin_tabla as (
  select t.edicion, t.codigo, t.tnr, m.n::int orden, m.n puesto, btrim(m.nombre) nombre, '' comite, null::text record, m.pts puntos
    from tor2 t,
         lateral (select x[1] n, x[2] nombre, x[3] pts
                    from regexp_matches(regexp_replace(regexp_replace(regexp_replace(t.c1, '<[^>]+>', ' ', 'g'), '&nbsp;', ' ', 'g'), '\s+', ' ', 'g'),
                                        ' (\d+)\. ([^(]+) \(Elo medio:\d+, (?:Capitán: [^/]*/ )?Des 1: ([0-9,]+)', 'g') x) m
   where t.es_equipo and (coalesce(t.c46, '') not like '%class="CRs1"%' or t.c46 like '%Ranking inicial de los equipos%')),
todo as (select * from de_tablas union all select * from sin_tabla),
borrar as (delete from public.jdn_resultados where tnr in (select tnr from src) returning 1)
insert into public.jdn_resultados (edicion, codigo, tnr, orden, puesto, nombre, comite, record, puntos)
select edicion, codigo, tnr, orden, puesto::smallint, btrim(nombre), btrim(comite), record, replace(puntos, ',', '.')::numeric
  from todo
 where (select count(*) from borrar) >= 0;
