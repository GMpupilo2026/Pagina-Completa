-- Los torneos de la federación de Costa Rica en chess-results de un año (ver
-- «Árbitros de Costa Rica en chess-results» en
-- docs/decisiones/juegos-y-torneos.md): una búsqueda del 01/01 al 31/12, hasta
-- 2000 filas (el año más grande, 2026, dio 603). :formulario es el id de
-- net._http_response del GET a https://s1.chess-results.com/TurnierSuche.aspx?lan=2
-- (sus campos ocultos van en el POST, y el POST va al mismo servidor: mandado a
-- chess-results.com redirige y vuelve el formulario vacío, sin error). :anios,
-- un arreglo de años ('{2026}' o '{2025,2026}'). pg_net no lo manda hasta
-- net.wake(). Lo que devuelve va a herramientas/arbitros-cr/exportar-cr.sql.
with f as (select content c from net._http_response where id = :formulario),
oc as (select string_agg(m[1]||'='||replace(replace(replace(replace(m[2],'%','%25'),'+','%2B'),'/','%2F'),'=','%3D'), '&') h
       from f, regexp_matches(f.c, '<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', 'g') m),
ins as (insert into net.http_request_queue(method,url,headers,body,timeout_milliseconds)
  select 'POST','https://s1.chess-results.com/TurnierSuche.aspx?lan=2', '{"Content-Type":"application/x-www-form-urlencoded"}'::jsonb,
    convert_to(oc.h || '&ctl00%24P1%24combo_art=5&ctl00%24P1%24combo_sort=3&ctl00%24P1%24combo_land=CRC&ctl00%24P1%24combo_bedenkzeit=0&ctl00%24P1%24combo_anzahl_zeilen=5'
      || '&ctl00%24P1%24txt_leiter=&ctl00%24P1%24txt_tnr=&ctl00%24P1%24txt_bez=&ctl00%24P1%24txt_veranstalter=&ctl00%24P1%24txt_Hauptschiedsrichter=&ctl00%24P1%24txt_Schiedsrichter=&ctl00%24P1%24txt_ort='
      || '&ctl00%24P1%24txt_von_tag=01%2F01%2F' || a || '&ctl00%24P1%24txt_bis_tag=31%2F12%2F' || a || '&ctl00%24P1%24txt_eventid='
      || '&ctl00%24P1%24cb_suchen=Buscar','utf8'), 120000
  from unnest(:anios::int[]) a, oc order by a returning id)
select min(id), max(id), count(*), net.wake() from ins;
