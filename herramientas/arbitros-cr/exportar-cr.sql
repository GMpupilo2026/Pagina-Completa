-- Las filas de los torneos de Costa Rica de las búsquedas de buscar-cr.sql
-- (:d a :h, ids de net._http_response), con las celdas 2 a 18 del buscador
-- ya sin etiquetas, en el mismo formato que afuera.sql. Lo que devuelve va
-- a herramientas/arbitros-cr/juntar-afuera.py --cr, que lo suma a
-- herramientas/datos/arbitros-cr-chess-results.json.
set statement_timeout = '55s';
with r as (select id, substr(content, strpos(content, '<table class="CRs2"')) t from net._http_response where id between :d and :h and strpos(content, '<table class="CRs2"') > 0),
filas as (select f from r, regexp_split_to_table(substr(t, 1, strpos(t, '</table>')), '<tr class="CR') f where f ~ '^n?g[12]">'),
celdas as materialized (select regexp_split_to_array(f, '</t[dh]>') c from filas),
s as (select distinct on (k) k, c from (select btrim(regexp_replace(c[19], '<[^>]+>', '', 'g')) k, c from celdas) z where k ~ '^\d+$')
select count(*) n, json_agg(json_build_array(k, (select array_agg(btrim(regexp_replace(regexp_replace(x, '<[^>]+>', '', 'g'), '\s+', ' ', 'g')) order by o) from unnest(c[2:18]) with ordinality u(x, o)))) filas from s;
