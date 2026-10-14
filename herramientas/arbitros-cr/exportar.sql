-- Resume lo bajado de ratings.fide.com para la herramienta arbitros-cr: un
-- JSON con cada torneo de Costa Rica (su ficha, sus jugadores con Elo y sus
-- árbitros con ID FIDE, federación y cargo). Lo que devuelve va, tal cual,
-- a herramientas/datos/arbitros-cr-fide.json, y herramientas/arbitros-cr.py
-- arma con eso las cargas.
--
-- Las páginas se piden antes con pg_net (ver «Árbitros de Costa Rica en
-- FIDE» en docs/decisiones/juegos-y-torneos.md): las listas mensuales
-- (a_tournaments.php?country=CRC&period=…), la ficha
-- (tournament_information.phtml), la lista con Elo (report.phtml) y el
-- reporte ronda a ronda (tournament_src_report.phtml). pg_net las borra a
-- las 6 horas: esto se corre antes. :desde es el primer id de net._http_response
-- de la tanda. Se corre por tramos de torneos (:ev_desde a :ev_hasta, el
-- código FIDE del torneo): todo junto son unos 100 MB de páginas y la
-- respuesta pasa de lo que devuelve execute_sql. Los tramos se juntan en el
-- JSON con herramientas/arbitros-cr/juntar.py.
with resp as (
  -- Se clasifica con strpos y los regex pasan solo por el pedazo de la ficha
  -- (8 KB desde «Event code»): por la página entera, con miles de páginas, la
  -- consulta pasa del statement_timeout.
  select id rid, content c,
    case when left(ltrim(content), 8) ~ '^\W*\{"data' then 'lista'
         when strpos(content, 'Event code') > 0 then 'info' when strpos(content, 'class="table2"') > 0 then 'rep'
         when strpos(content, 'calc_table') > 0 then 'src' end tipo
  from net._http_response where id > :desde and status_code = 200
), resp2 as (
  select *, case when tipo = 'info' then substr(c, strpos(c, 'Event code'), 8000) end pedazo from resp
), resp3 as (
  select *, regexp_replace(regexp_replace(pedazo, '<[^>]+>', ' | ', 'g'), '(\s*\|\s*)+', ' | ', 'g') s,
    case when tipo = 'info' then substring(regexp_replace(regexp_replace(pedazo, '<[^>]+>', ' | ', 'g'), '(\s*\|\s*)+', ' | ', 'g') from 'Event code \| &nbsp;(\d+)')
         when tipo in ('rep', 'src') then substring(c from 'tournament_information\.phtml\?event=(\d+)') end ev
  from resp2
), evs as (
  select distinct x->>0 ev from resp, jsonb_array_elements(substr(c, strpos(c, '{'))::jsonb->'data') x where tipo = 'lista'
), ult as (select distinct on (tipo, ev) * from resp3 where tipo in ('info', 'rep', 'src') and ev::int between :ev_desde and :ev_hasta order by tipo, ev, rid desc),
info as (
  select ev, pedazo c, s from ult where tipo = 'info'
), info2 as (
  select ev,
    btrim(substring(s from 'Tournament Name \| &nbsp;([^|]*)')) nombre,
    btrim(substring(s from 'City \| &nbsp;([^|]*)')) ciudad,
    btrim(substring(s from 'Country \| &nbsp;([^|]*)')) pais,
    substring(s from 'Number of players \| &nbsp;(\d+)')::int jugadores,
    btrim(substring(s from 'System \| &nbsp;([^|]*)')) sistema,
    btrim(substring(s from 'Hybrid \| &nbsp;([^|]*)')) = 'YES' hibrido,
    substring(s from 'Start Date \| &nbsp;([\d-]+)') inicio,
    substring(s from 'End Date \| &nbsp;([\d-]+)') fin,
    btrim(replace(substring(s from 'Time Control \| &nbsp;([^|]*)'), '&nbsp;', ' ')) control,
    substring(s from 'Rated for [A-Za-z]+ \d{4}\s+as ([A-Za-z]+)') ritmo,
    btrim(substring(s from 'Rated for ([A-Za-z]+ \d{4})')) valorado
  from info
), arbitros as (
  -- Cada fila de cargo de la ficha («Chief Arbiter», «Deputy Chief
  -- Arbiter»…) con sus enlaces al perfil: <a href=/profile/ID …>Nombre (FED) …</a>.
  select i.ev, f[1] cargo, a[1] fid, btrim(a[2]) nombre, a[3] fed
  from info i,
       regexp_matches(regexp_replace(i.c, '\s+', ' ', 'g'), '<td class=info_table_l>([A-Za-z ]*Arbiter)</td><td>((?:[^<]|<(?!/td>))*)</td>', 'g') f,
       regexp_matches(f[2], '<a href=/profile/(\d+)[^>]*>([^<(]*)\(([A-Z]{3})\)', 'g') a
), rep as (
  select ev, m[1] fid, m[2] fed
  from ult, regexp_matches(regexp_replace(c, '\s+', ' ', 'g'), '<tr> <td>(\d+)</td> <td width=70%><a [^>]*>[^<]*</a></td> <td width=40>&nbsp;([A-Z]*)</td><td>[^<]*</td><td width=20>&nbsp;(\d+)</td>', 'g') m
  where tipo = 'rep'
), src_p as (
  select ev, pieza, lag(pieza) over (partition by ev order by o) previa
  from ult, regexp_split_to_table(regexp_replace(c, '\s+', ' ', 'g'), '<td bgcolor=#CBD8F9><a name=') with ordinality as p(pieza, o)
  where tipo = 'src'
), src as (
  select ev, substring(previa from '<td bgcolor=#CBD8F9>(\d+)</td> $') fid,
    (length(pieza) - length(replace(pieza, 'Forfeit</font> (-)', ''))) / length('Forfeit</font> (-)') ausencias
  from src_p where previa is not null
), rondas as (
  select ev, max(m[1]::int) rondas from ult, regexp_matches(c, '<td bgcolor=#FFFFFF>(\d+)\s+\d\d/\d\d/\d\d', 'g') m where tipo = 'src' group by ev
)
select json_build_object('actualizado', to_char(now() at time zone 'America/Costa_Rica', 'YYYY-MM-DD'),
  'torneos', json_agg(json_build_object(
    'id', i.ev::int, 'nombre', i.nombre, 'ciudad', i.ciudad, 'pais', i.pais, 'jugadores', i.jugadores,
    'sistema', i.sistema, 'hibrido', i.hibrido, 'inicio', i.inicio, 'fin', i.fin, 'control', i.control, 'ritmo', i.ritmo,
    'valorado', i.valorado, 'rondas', ro.rondas,
    'tieneReporte', exists (select 1 from ult u where u.tipo = 'rep' and u.ev = i.ev),
    'tieneRondas', exists (select 1 from ult u where u.tipo = 'src' and u.ev = i.ev),
    'arbitros', (select coalesce(json_agg(json_build_object('fid', a.fid, 'nombre', a.nombre, 'fed', a.fed, 'cargo', a.cargo) order by a.cargo, a.fid), '[]')
                 from arbitros a where a.ev = i.ev),
    'conElo', (select coalesce(json_agg(json_build_object('fid', r.fid, 'fed', r.fed, 'ausencias', coalesce(s.ausencias, 0)) order by r.fid), '[]')
               from rep r left join src s on s.ev = r.ev and s.fid = r.fid where r.ev = i.ev)
  ) order by i.ev::int)) datos
from info2 i left join rondas ro on ro.ev = i.ev
where i.ev in (select ev from evs);
