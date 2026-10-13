-- Llena public.jdn_jugadores con los jugadores de los torneos individuales
-- (finales y eliminatorias): sus partidas jugadas y su rendimiento contra el
-- Elo. Ver «El rendimiento contra el Elo» en docs/decisiones/juegos-y-torneos.md.
--
-- Como cargar.sql, son dos pasos, porque pg_net contesta después:
--
-- 1) Pedir, de cada torneo individual, la tabla cruzada (art=4) y la
--    clasificación (art=1), en ese orden, una detrás de la otra: el pedido
--    impar es la tabla cruzada y el par la clasificación (los números de
--    pedido son seguidos; si el primero sale par, cambiar «% 2 = 1» abajo):
--
--      select min(a4), max(a1) from (select
--               net.http_get('https://s3.chess-results.com/tnr'||tnr||'.aspx?lan=2&art=4&turdet=YES&zeilen=99999', timeout_milliseconds := 60000) a4,
--               net.http_get('https://s3.chess-results.com/tnr'||tnr||'.aspx?lan=2&art=1&turdet=YES&zeilen=99999', timeout_milliseconds := 60000) a1
--        from (select distinct tnr from public.jdn_resultados where codigo !~ '-E' order by tnr) t) p;
--
-- 2) Esperar a que net.http_request_queue quede vacía y correr este archivo
--    con ese rango de pedidos en :desde y :hasta, de a unos 100 pedidos. Cada
--    tanda borra antes lo de sus torneos.
--
-- Las reglas:
--   · las dos tablas vienen en el orden de la clasificación final: la fila n
--     de la tabla cruzada es la fila n de la clasificación y el orden n de
--     jdn_resultados (comprobado al cargar: los 148 torneos, nombre por nombre);
--   · sistema suizo: cada ronda («1.Rd») dice el rival por su puesto, el color
--     y el resultado («18w1», «5b½»); todos contra todos: la columna es el
--     puesto del rival y la celda trae una o dos partidas («1 1», «(0 +)»);
--   · cuenta lo jugado: 1, ½ o 0; los forfeits («+», «-») y los byes no;
--   · el Elo sale de la clasificación: el nacional (EloN) si lo hay, si no el
--     que la página llama Elo, si no el FIDE; 0 es «sin Elo»;
--   · lo esperado se calcula igual que en los equipos (FIDE, diferencia
--     topada en 400). Comprobado al cargar: cada partida aparece en los dos
--     jugadores con el resultado al revés.

with pag as (
  select r.id % 2 = 1 es4, substring(r.content from 'tnr(\d+)\.aspx')::int tnr,
         split_part(substr(r.content, strpos(r.content, '<table class="CRs1"')), '</table>', 1) html
    from net._http_response r where r.id between :desde and :hasta and r.status_code = 200),
filas as (
  select p.tnr, p.es4, u.o, substring(u.x from '<tr[^>]*class="([^"]*)"') clase,
         array(select btrim(replace(replace(regexp_replace(c, '<[^>]+>', '', 'g'), '&nbsp;', ' '), '&frac12;', '½'), E' \r\n\t')
                 from unnest(regexp_split_to_array(u.x, '</t[hd]>')) c) celdas
    from pag p, unnest(string_to_array(p.html, '</tr>')) with ordinality u(x, o)
   where u.x like '%<t%'),
cab as (select distinct on (tnr, es4) tnr, es4, o, celdas cols from filas where 'Rk.' = any(celdas) order by tnr, es4, o),
jug as materialized (
  select f.tnr, f.es4, row_number() over (partition by f.tnr, f.es4 order by f.o) n, f.celdas c, k.cols
    from filas f join cab k using (tnr, es4)
   where f.o > k.o and f.clase ~ '^CRng[12]( |$)'),
elo as materialized (
  select tnr, n, btrim(c[array_position(cols, 'Nombre')]) nombre,
         coalesce(nullif(c[array_position(cols, 'EloN')], '0'), nullif(c[array_position(cols, 'Elo')], '0'), nullif(c[array_position(cols, 'FIDE')], '0'))::int elo
    from jug where not es4),
ronda as (
  select j.tnr, j.n, h.t, j.c[h.i] v
    from jug j, unnest(j.cols) with ordinality h(t, i)
   where j.es4 and (h.t ~ '^\d+\.Rd$' or h.t ~ '^\d+$')),
partidas as materialized (
  select tnr, n, substring(v from '^(\d+)\s*[wbs]')::int rival,
         case substring(v from '^\d+\s*[wbs]\s*(1|0|½)$') when '1' then 1 when '½' then 0.5 when '0' then 0 end res
    from ronda where t ~ '\.Rd$'
  union all
  select tnr, n, t::int, case tok when '1' then 1 when '½' then 0.5 when '0' then 0 end
    from ronda, regexp_split_to_table(btrim(translate(v, '()', '  ')), '\s+') tok
   where t ~ '^\d+$' and tok in ('1', '0', '½')),
suma as (
  select e.tnr, e.n,
         count(p.res) partidas, coalesce(sum(p.res), 0) puntos,
         count(p.res) filter (where o.elo > 0) con_elo,
         coalesce(sum(p.res) filter (where o.elo > 0), 0) puntos_elo,
         round(avg(o.elo) filter (where p.res is not null and o.elo > 0)) elo_rivales,
         round(sum(1 / (1 + power(10, greatest(-400, least(400, o.elo - e.elo)) / 400.0)))
               filter (where p.res is not null and o.elo > 0 and e.elo > 0), 2) esperado
    from elo e
    left join partidas p on p.tnr = e.tnr and p.n = e.n and p.res is not null
    left join elo o on o.tnr = p.tnr and o.n = p.rival
   group by e.tnr, e.n),
torneo as (select distinct tnr, edicion, codigo from public.jdn_resultados where codigo !~ '-E'),
borrar as (delete from public.jdn_jugadores where tnr in (select tnr from pag) returning 1)
insert into public.jdn_jugadores (edicion, codigo, tnr, orden, nombre, elo, partidas, puntos, con_elo, puntos_elo, elo_rivales, esperado)
select t.edicion, t.codigo, e.tnr, e.n, e.nombre, nullif(e.elo, 0), s.partidas, s.puntos, s.con_elo, s.puntos_elo, s.elo_rivales, s.esperado
  from elo e join suma s using (tnr, n) join torneo t using (tnr)
 where (select count(*) from borrar) >= 0;
