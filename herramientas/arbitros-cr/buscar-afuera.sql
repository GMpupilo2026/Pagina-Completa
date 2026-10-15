-- Las búsquedas de chess-results en todos los países, por árbitro (ver
-- «Árbitros de Costa Rica en el extranjero» en docs/decisiones/juegos-y-torneos.md).
-- :formulario es el id de net._http_response del GET a
-- https://s1.chess-results.com/TurnierSuche.aspx?lan=2 (sus campos ocultos van
-- en cada POST, y el POST va al mismo servidor). :terminos, un arreglo de
-- términos ya codificados para un formulario (application/x-www-form-urlencoded):
-- cada ID FIDE, cada primer apellido con sus formas con tilde que aparecen en
-- los torneos de Costa Rica, y para los apellidos que llenan las 2000 filas,
-- «Apellido1 Apellido2» y «Nombre Apellido1». Cada término se busca en la
-- casilla de árbitro principal y en la de árbitros (que también mira la de
-- adjunto). De a 40 términos (80 pedidos) por vez: pg_net no los manda hasta
-- net.wake().
with f as (select content c from net._http_response where id = :formulario),
oc as (select string_agg(m[1]||'='||replace(replace(replace(replace(m[2],'%','%25'),'+','%2B'),'/','%2F'),'=','%3D'), '&') h
       from f, regexp_matches(f.c, '<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', 'g') m),
busq as (select t.termino, t.k, c.campo from unnest(:terminos::text[]) with ordinality t(termino, k), (values ('txt_Hauptschiedsrichter'), ('txt_Schiedsrichter')) c(campo)),
ins as (insert into net.http_request_queue(method,url,headers,body,timeout_milliseconds)
  select 'POST','https://s1.chess-results.com/TurnierSuche.aspx?lan=2', '{"Content-Type":"application/x-www-form-urlencoded"}'::jsonb,
    convert_to(oc.h || '&ctl00%24P1%24combo_art=5&ctl00%24P1%24combo_sort=3&ctl00%24P1%24combo_land=-&ctl00%24P1%24combo_bedenkzeit=0&ctl00%24P1%24combo_anzahl_zeilen=5'
      || (select string_agg('&ctl00%24P1%24'||x||'='||case when x=b.campo then b.termino else '' end, '') from unnest(array['txt_leiter','txt_tnr','txt_bez','txt_veranstalter','txt_Hauptschiedsrichter','txt_Schiedsrichter','txt_ort','txt_von_tag','txt_bis_tag','txt_eventid']) x)
      || '&ctl00%24P1%24cb_suchen=Buscar','utf8'), 120000
  from busq b, oc order by b.k, b.campo returning id)
select min(id), max(id), count(*), net.wake() from ins;
