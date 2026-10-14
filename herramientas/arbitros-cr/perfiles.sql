-- El título de árbitro de cada árbitro de Costa Rica, de su perfil de FIDE
-- (ratings.fide.com/profile/ID, pedido antes con pg_net): «Arbiter/Trainer
-- | FIDE Arbiter (2016) | International Arbiter (2020)» y «Arbiter Category
-- D». Lo que devuelve va tal cual a herramientas/datos/arbitros-cr-perfiles.json.
-- :desde es el primer id de net._http_response de la tanda de perfiles.
with p as (
  select distinct on (fid) fid, s from (
    select id, substring(content from 'var event_n1=''(\d+)''') fid,
      regexp_replace(regexp_replace(substr(content, strpos(content, 'Arbiter/Trainer'), 3000), '<[^>]+>', ' | ', 'g'), '\s+', ' ', 'g') s
    from net._http_response where id >= :desde and status_code = 200 and strpos(content, 'FIDE title') > 0) x
  where fid is not null order by fid, id desc
)
select json_build_object('perfiles', json_agg(json_build_object(
  'fid', fid,
  'titulos', (select coalesce(json_agg(json_build_array(m[1], m[2]::int)), '[]') from regexp_matches(s, '(International Arbiter|FIDE Arbiter|National Arbiter) \((\d{4})\)', 'g') m),
  'categoria', substring(s from 'Arbiter Category ([A-D])')) order by fid::int)) datos
from p;
