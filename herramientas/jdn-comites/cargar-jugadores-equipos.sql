-- Llena public.jdn_jugadores con los integrantes de los torneos por equipos
-- (finales y eliminatorias). Ver «Los integrantes de cada equipo» y «El
-- rendimiento contra el Elo» en docs/decisiones/juegos-y-torneos.md.
--
-- Como cargar.sql, son dos pasos, porque pg_net contesta después:
--
-- 1) Pedir la composición de equipos con la información de cada jugador
--    (art=20; turdet=YES trae el detalle partida por partida):
--
--      select min(id), max(id) from (select net.http_get(
--               'https://s3.chess-results.com/tnr'||tnr||'.aspx?lan=2&art=20&turdet=YES&zeilen=99999',
--               timeout_milliseconds := 60000) id
--        from (select distinct tnr from public.jdn_resultados where codigo ~ '-E' order by tnr) t) p;
--
-- 2) Esperar a que net.http_request_queue quede vacía y correr este archivo
--    con ese rango de pedidos en :desde y :hasta. Las páginas pesan (hasta
--    300 kB): de a 10 o 15 pedidos por vez, para no pasar el tiempo máximo de
--    una consulta. Cada tanda borra antes lo de sus torneos. El número de
--    torneo sale de la misma página; la edición y el código, de
--    jdn_resultados.
--
-- Las reglas:
--   · la página trae primero la composición de cada equipo («1. CCDR Belén E
--     (Elo medio…)», con una fila por jugador: M. es su tablero) y después,
--     desde «Información de jugadores», un bloque por jugador con cada
--     partida: el Elo del rival y el resultado («w 1», «s ½»);
--   · los bloques no vienen en el orden de la composición: se juntan por el
--     nombre (sin la coma que chess-results pone en la composición, o con lo
--     de antes y lo de después de la coma al revés: algunos torneos escriben
--     «Nombre, Apellidos» en la composición y «Apellidos Nombre» en el
--     bloque, como el JUNCOS 2023). El
--     encabezado del bloque es «Nombre  WCM 1716 CRC Rp:1823»: se le quita
--     del final el título, el Elo, la federación y el «Rp» (no se corta en
--     el primer par de espacios: hay nombres con dos espacios adentro, como
--     «Chavarria  Juan Carlos»);
--   · solo toma las páginas de equipos (con «Información de jugadores»), para
--     que una tanda con tablas cruzadas no borre a los individuales;
--   · el Elo es el nacional (EloN) si lo hay, si no el que la página llama Elo,
--     si no el FIDE; 0 es «sin Elo»;
--   · una partida cuenta si tiene color y un resultado 1, ½ o 0: los forfeits
--     («+», «-») y los byes («- 1K») no se jugaron;
--   · lo esperado es la suma, partida por partida contra rivales con Elo, de
--     1 / (1 + 10^(−D/400)), con la diferencia D topada en 400 (regla de FIDE).

with pag as (
  select substring(r.content from 'tnr(\d+)\.aspx')::int tnr, substr(r.content, strpos(r.content, '<table class="CRs1"')) html
    from net._http_response r where r.id between :desde and :hasta and r.status_code = 200
     and r.content like '%Información de jugadores%'),
filas as (
  select p.tnr, u.o, substring(u.x from '<tr[^>]*class="([^"]*)"') clase,
         array(select btrim(replace(replace(regexp_replace(c, '<[^>]+>', '', 'g'), '&nbsp;', ' '), '&frac12;', '½'), E' \r\n\t')
                 from unnest(regexp_split_to_array(u.x, '</t[hd]>')) c) celdas
    from pag p, unnest(string_to_array(p.html, '</tr>')) with ordinality u(x, o)
   where u.x like '%<t%'),
marca as (select tnr, min(o) o from filas where celdas[1] like 'Información de jugadores%' group by tnr),
ubic as (
  select f.*, f.o >= m.o detalle,
         max(case when clase like 'CRng1b%' then f.o end) over w cab_o,
         max(case when clase like 'CRg1b%' then f.o end) over w grupo_o
    from filas f join marca m using (tnr)
  window w as (partition by f.tnr order by f.o)),
datos as materialized (
  select u.tnr, u.o, u.detalle, u.celdas c, h.celdas cab, btrim(g.celdas[1]) grupo
    from ubic u join filas h on h.tnr = u.tnr and h.o = u.cab_o join filas g on g.tnr = u.tnr and g.o = u.grupo_o
   where u.clase ~ '^CRng[12]( |$)'),
integrantes as materialized (
  select tnr, row_number() over (partition by tnr order by o) orden,
         btrim(substring(grupo from '^\d+\.\s*([^(]*(?:\( ?[A-Z]{3} ?\))?)')) equipo,
         substring(grupo from '^(\d+)\.')::smallint equipo_orden,
         nullif(c[array_position(cab, 'M.')], '')::smallint tablero,
         btrim(c[array_position(cab, 'Nombre')]) nombre,
         coalesce(nullif(c[array_position(cab, 'EloN')], '0'), nullif(c[array_position(cab, 'Elo')], '0'), nullif(c[array_position(cab, 'FIDE')], '0'))::int elo
    from datos
   where not detalle and array_position(cab, 'Nombre') is not null and array_position(cab, 'M.') is not null and grupo ~ '^\d+\.'),
partidas as materialized (
  select tnr,
         lower(regexp_replace(regexp_replace(regexp_replace(grupo, '^Información de jugadores\s*', ''), '\s+((W?(GM|IM|FM|CM)|A(IM|FM|CM))\s+)?\d+(\s+[A-Z]{3})?\s+Rp:\S*$', ''), '\s+', ' ', 'g')) k,
         coalesce(nullif(c[array_position(cab, 'EloN')], '0'), nullif(c[array_position(cab, 'Elo')], '0'), nullif(c[array_position(cab, 'FIDE')], '0'))::int elo_rival,
         case substring(c[array_position(cab, 'Res.')] from '^[wsb]\s*(1|0|½)$') when '1' then 1 when '½' then 0.5 when '0' then 0 end res
    from datos
   where detalle and array_position(cab, 'Res.') is not null),
suma as (
  select i.tnr, i.orden,
         count(p.res) partidas, coalesce(sum(p.res), 0) puntos,
         count(p.res) filter (where p.elo_rival > 0) con_elo,
         coalesce(sum(p.res) filter (where p.elo_rival > 0), 0) puntos_elo,
         round(avg(p.elo_rival) filter (where p.res is not null and p.elo_rival > 0)) elo_rivales,
         round(sum(1 / (1 + power(10, greatest(-400, least(400, p.elo_rival - i.elo)) / 400.0)))
               filter (where p.res is not null and p.elo_rival > 0 and i.elo > 0), 2) esperado
    from integrantes i left join partidas p on p.tnr = i.tnr
     and p.k in (lower(regexp_replace(replace(i.nombre, ',', ''), '\s+', ' ', 'g')),
                 lower(regexp_replace(btrim(split_part(i.nombre, ',', 2)) || ' ' || split_part(i.nombre, ',', 1), '\s+', ' ', 'g')))
   group by i.tnr, i.orden),
torneo as (select distinct tnr, edicion, codigo from public.jdn_resultados where codigo ~ '-E'),
borrar as (delete from public.jdn_jugadores where tnr in (select tnr from pag) returning 1)
insert into public.jdn_jugadores (edicion, codigo, tnr, orden, equipo, equipo_orden, tablero, nombre, elo,
                                  partidas, puntos, con_elo, puntos_elo, elo_rivales, esperado)
select t.edicion, t.codigo, i.tnr, i.orden, i.equipo, i.equipo_orden, i.tablero, i.nombre, nullif(i.elo, 0),
       s.partidas, s.puntos, s.con_elo, s.puntos_elo, s.elo_rivales, s.esperado
  from integrantes i join suma s using (tnr, orden) join torneo t using (tnr)
 where (select count(*) from borrar) >= 0;
