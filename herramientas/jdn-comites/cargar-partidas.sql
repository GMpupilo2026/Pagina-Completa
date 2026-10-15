-- Llena public.jdn_partidas: cada partida jugada de los torneos JDN, una vez,
-- con su ronda, los dos jugadores (su orden en jdn_jugadores) y el
-- resultado. Ver «Los enfrentamientos entre comités» en
-- docs/decisiones/juegos-y-torneos.md. Antes tiene que estar cargada
-- jdn_jugadores (los equipos se juntan por nombre con su composición).
--
-- Como cargar.sql, son dos pasos, porque pg_net contesta después:
--
-- 1) Pedir, de cada torneo, la composición de equipos con el detalle de cada
--    jugador (art=20) si es por equipos, o la tabla cruzada (art=4) si es
--    individual:
--
--      select min(id), max(id) from (select net.http_get(
--               'https://s3.chess-results.com/tnr'||tnr||'.aspx?lan=2&art='||art||'&turdet=YES&zeilen=99999',
--               timeout_milliseconds := 60000) id
--        from (select tnr, case when codigo ~ '-E' then 20 else 4 end art
--                from (select distinct tnr, codigo from public.jdn_resultados) t order by tnr) x) p;
--
-- 2) Esperar a que net.http_request_queue quede vacía y correr este archivo
--    con ese rango de pedidos en :desde y :hasta, de a unos 30 pedidos (las
--    páginas de equipos pesan hasta 300 kB). Cada tanda borra antes lo de sus
--    torneos. Una página con «Información de jugadores» es de equipos; las
--    demás, tablas cruzadas.
--
-- Las reglas:
--   · equipos: en el bloque de cada jugador, cada fila es una partida con la
--     ronda («Rd.»), el rival («Nombre») y el resultado («w 1», «s ½»); el
--     jugador y el rival se buscan por nombre en jdn_jugadores (sin la coma de
--     la composición, o con sus dos partes al revés, como en
--     cargar-jugadores-equipos.sql; ningún nombre se repite dentro de un
--     torneo);
--   · individuales: como en cargar-jugadores-individual.sql, el rival es su
--     puesto en la tabla, que es su orden; en todos contra todos la ronda es 0
--     y «vez» separa las dos partidas de un doble todos contra todos;
--   · antes del archivo va «set join_collapse_limit = 1;» (en la misma
--     llamada): los CTE se estiman en un puñado de filas y, sin fijar el
--     orden, Postgres une primero a los jugadores entre sí y tarda minutos;
--   · cada partida está en los dos jugadores: se guarda desde el de menor
--     orden. Comprobado al cargar: cada partida está una sola vez y las del
--     otro lado dicen el resultado al revés.

set join_collapse_limit = 1;

with pag as (
  select substring(r.content from 'tnr(\d+)\.aspx')::int tnr, r.content like '%Información de jugadores%' es_eq,
         split_part(substr(r.content, strpos(r.content, '<table class="CRs1"')), '</table>', 1) primera,
         substr(r.content, strpos(r.content, '<table class="CRs1"')) html
    from net._http_response r where r.id between :desde and :hasta and r.status_code = 200),
filas as (
  select p.tnr, p.es_eq, u.o, substring(u.x from '<tr[^>]*class="([^"]*)"') clase,
         array(select btrim(replace(replace(regexp_replace(c, '<[^>]+>', '', 'g'), '&nbsp;', ' '), '&frac12;', '½'), E' \r\n\t')
                 from unnest(regexp_split_to_array(u.x, '</t[hd]>')) c) celdas
    from pag p, unnest(string_to_array(case when p.es_eq then p.html else p.primera end, '</tr>')) with ordinality u(x, o)
   where u.x like '%<t%'),
-- Equipos: los bloques de «Información de jugadores».
marca as (select tnr, min(o) o from filas where es_eq and celdas[1] like 'Información de jugadores%' group by tnr),
ubic as (
  select f.*, max(case when clase like 'CRng1b%' then f.o end) over w cab_o, max(case when clase like 'CRg1b%' then f.o end) over w grupo_o
    from filas f join marca m using (tnr) where f.o >= m.o
  window w as (partition by f.tnr order by f.o)),
-- El encabezado de columnas y el nombre del bloque se arrastran con
-- first_value (la fila de encabezado es la primera de su partición), sin
-- volver a unir filas consigo misma: con las estimaciones de un CTE, esa
-- unión cruzaba todas las filas de cada torneo y no terminaba.
arrastre as (
  select u.*, first_value(u.celdas) over (partition by u.tnr, u.cab_o order by u.o) cab,
         first_value(u.celdas[1]) over (partition by u.tnr, u.grupo_o order by u.o) grupo
    from ubic u),
det as materialized (
  select tnr, nullif(c[array_position(cab, 'Rd.')], '')::smallint ronda,
         lower(regexp_replace(regexp_replace(regexp_replace(grupo, '^Información de jugadores\s*', ''), '\s+((W?(GM|IM|FM|CM)|A(IM|FM|CM))\s+)?\d+(\s+[A-Z]{3})?\s+Rp:\S*$', ''), '\s+', ' ', 'g')) k,
         lower(regexp_replace(c[array_position(cab, 'Nombre')], '\s+', ' ', 'g')) k_rival,
         case substring(c[array_position(cab, 'Res.')] from '^[wsb]\s*(1|0|½)$') when '1' then 1 when '½' then 0.5 when '0' then 0 end puntos
    from (select tnr, celdas c, cab, grupo, clase from arrastre) x
   where clase ~ '^CRng[12]( |$)' and 'Res.' = any(cab)),
llave as materialized (
  select tnr, orden, lower(regexp_replace(replace(nombre, ',', ''), '\s+', ' ', 'g')) k from public.jdn_jugadores
   where equipo is not null and tnr in (select tnr from pag where es_eq)
  union
  select tnr, orden, lower(regexp_replace(btrim(split_part(nombre, ',', 2)) || ' ' || split_part(nombre, ',', 1), '\s+', ' ', 'g')) from public.jdn_jugadores
   where equipo is not null and nombre like '%,%' and tnr in (select tnr from pag where es_eq)),
de_equipos as (
  select d.tnr, d.ronda, a.orden, b.orden rival, d.puntos
    from det d
    join llave a on a.tnr = d.tnr and a.k = d.k
    join llave b on b.tnr = d.tnr and b.k = d.k_rival),
-- Individuales: la tabla cruzada.
cab as (select distinct on (tnr) tnr, o, celdas cols from filas where not es_eq and 'Rk.' = any(celdas) order by tnr, o),
jug as materialized (
  select f.tnr, row_number() over (partition by f.tnr order by f.o) n, f.celdas c, k.cols
    from filas f join cab k using (tnr) where f.o > k.o and f.clase ~ '^CRng[12]( |$)'),
ronda as (
  select j.tnr, j.n, h.t, j.c[h.i] v from jug j, unnest(j.cols) with ordinality h(t, i)
   where h.t ~ '^\d+\.Rd$' or h.t ~ '^\d+$'),
de_individuales as (
  select tnr, substring(t from '^(\d+)')::smallint ronda, n orden, substring(v from '^(\d+)\s*[wbs]')::int rival,
         case substring(v from '^\d+\s*[wbs]\s*(1|0|½)$') when '1' then 1 when '½' then 0.5 when '0' then 0 end puntos
    from ronda where t ~ '\.Rd$'
  union all
  select tnr, 0, n, t::int, case tok when '1' then 1 when '½' then 0.5 when '0' then 0 end
    from ronda, regexp_split_to_table(btrim(translate(v, '()', '  ')), '\s+') tok
   where t ~ '^\d+$' and tok in ('1', '0', '½')),
todas as (
  select tnr, coalesce(ronda, 0) ronda, orden, rival, puntos from de_equipos where puntos is not null
  union all
  select tnr, ronda, orden, rival, puntos from de_individuales where puntos is not null),
una as (
  select tnr, ronda, orden, rival, puntos, row_number() over (partition by tnr, ronda, orden, rival order by puntos) vez
    from todas where orden < rival),
borrar as (delete from public.jdn_partidas where tnr in (select tnr from pag) returning 1)
insert into public.jdn_partidas (tnr, ronda, orden, rival, vez, puntos)
select tnr, ronda, orden, rival, vez, puntos from una
 where (select count(*) from borrar) >= 0;
