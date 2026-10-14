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
-- de la tanda.
with resp as (
  select id rid, content c,
    case when content ~ '^\W*\{"data"' then 'lista'
         when content ~ 'Event code' then 'info' when content ~ 'class="table2"' then 'rep' when content ~ 'calc_table' then 'src' end tipo,
    coalesce(substring(regexp_replace(regexp_replace(content, '<[^>]+>', ' | ', 'g'), '(\s*\|\s*)+', ' | ', 'g') from 'Event code \| &nbsp;(\d+)'),
             substring(content from 'tournament_information\.phtml\?event=(\d+)')) ev
  from net._http_response where id > :desde and status_code = 200
), evs as (
  select distinct x->>0 ev from resp, jsonb_array_elements(substr(c, strpos(c, '{'))::jsonb->'data') x where tipo = 'lista'
), ult as (select distinct on (tipo, ev) * from resp where tipo in ('info', 'rep', 'src') order by tipo, ev, rid desc),
info as (
  select ev, c, regexp_replace(regexp_replace(c, '<[^>]+>', ' | ', 'g'), '(\s*\|\s*)+', ' | ', 'g') s from ult where tipo = 'info'
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
